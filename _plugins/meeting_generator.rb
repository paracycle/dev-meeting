require 'date'
require 'uri'
require 'yaml'
require 'kramdown'
require 'kramdown-parser-gfm'

module RubyDevMeeting
  # Represents a single meeting log parsed from the dev-meeting-log repo
  class MeetingData
    attr_accessor :title, :date, :year, :month, :day, :slug, :lang, :content,
                  :raw_content, :file_path, :url, :summary_html, :summary_plain,
                  :ticket_count, :tickets, :language_pair, :has_frontmatter

    def initialize(file_path, base_path)
      @file_path = file_path
      @base_path = base_path
      @tickets = []
      @lang = "en"
      @has_frontmatter = false
      parse!
    end

    def to_liquid
      {
        "title" => @title,
        "date" => @date&.to_s,
        "date_formatted" => @date ? @date.strftime("%B %d, %Y") : @title,
        "year" => @year,
        "month" => @month,
        "month_name" => @date ? @date.strftime("%B") : nil,
        "day" => @day,
        "slug" => @slug,
        "lang" => @lang,
        "url" => @url,
        "summary_html" => @summary_html,
        "summary_plain" => @summary_plain,
        "ticket_count" => @ticket_count,
        "tickets" => @tickets.first(5),
        "has_language_pair" => !@language_pair.nil?,
        "language_pair_url" => @language_pair,
        "language_pair_lang" => @lang == "en" ? "ja" : "en",
      }
    end

    private

    def parse!
      raw = File.read(@file_path)

      # Parse optional YAML frontmatter
      if raw =~ /\A---\s*\n(.*?\n?)---\s*\n/m
        begin
          fm = YAML.safe_load($1) || {}
          @lang = fm["lang"] || "en"
          @has_frontmatter = true
        rescue
          @lang = "en"
        end
        @raw_content = raw.sub(/\A---\s*\n.*?\n?---\s*\n/m, '')
      else
        @raw_content = raw
        @lang = "en"
      end

      # Filter [secret] sections
      @content = filter_secrets(@raw_content)

      # Unwrap Google Docs redirect URLs to their real targets
      @content = unwrap_google_redirects(@content)

      # Remove escaped brackets around markdown links: \[[text](url)\] -> [text](url)
      @content = fix_escaped_bracket_links(@content)

      # Normalize alternate link format: [[Bug #123](url)] -> [[Bug #123]](url)
      @content = normalize_ticket_links(@content)

      # Fix unclosed double-bracket links: [[Bug #123](url) text -> [[Bug #123]](url) text
      @content = fix_unclosed_bracket_links(@content)

      # Extract date and title from filename
      parse_filename!

      # Extract summary information
      extract_summary!
    end

    def parse_filename!
      basename = File.basename(@file_path, '.md')
      relative = @file_path.sub(@base_path + '/', '')
      @year = relative.split('/').first.to_i

      case basename
      when /\ADevMeeting-(\d{4})-(\d{2})-(\d{2})(-JA)?\z/
        y, m, d = $1.to_i, $2.to_i, $3.to_i
        is_ja = !$4.nil?
        @date = Date.new(y, m, d)
        @month = m
        @day = d
        @title = "#{@date.strftime('%b %Y')} Meeting"
        @slug = is_ja ? "#{@date.strftime('%m-%d')}-ja" : @date.strftime('%m-%d')
        @lang = "ja" if is_ja && !@has_frontmatter
      when /\ADevelopersMeeting(\d{4})(\d{2})(\d{2})Japan\z/
        y, m, d = $1.to_i, $2.to_i, $3.to_i
        @date = Date.new(y, m, d)
        @month = m
        @day = d
        @title = "#{@date.strftime('%b %Y')} Meeting"
        @slug = @date.strftime('%m-%d')
      when /\ADevCamp-(\d{2})-(\d{2})\z/
        m, d = $1.to_i, $2.to_i
        @date = Date.new(@year, m, d) rescue nil
        @month = m
        @day = d
        @title = "#{@date&.strftime('%b')} #{@year} DevCamp"
        @slug = "devcamp-#{format('%02d', m)}-#{format('%02d', d)}"
      else
        @title = basename
        @slug = basename.downcase.gsub(/[^a-z0-9\-]/, '-')
        @month = 1
        @day = 1
      end

      @url = "/meetings/#{@year}/#{@slug}/"
    end

    def extract_summary!
      lines = @content.lines
      @tickets = []

      lines.each do |line|
        # Match ticket references like [[Feature #12345]] or [[Bug #12345]]
        line.scan(/\[\[(?:Feature|Bug|Misc|Discussion)\s*#(\d+)\]\]/).each do |match|
          @tickets << match[0]
        end
        # Also match plain issue references
        line.scan(/\[(?:Feature|Bug|Misc)\s*#(\d+)\](?!\()/).each do |match|
          @tickets << match[0]
        end
      end
      @tickets.uniq!
      @ticket_count = @tickets.size

      # Build summary from the first few ticket/topic titles
      topics = []
      lines.each do |line|
        next unless line =~ /\A###\s+(.+)/
        heading = $1.strip

        # Strip ticket references in all formats:
        #   [[Feature #12345]](url)  - standard format
        #   [[Bug #12345](url)]      - alternate format
        #   [Feature #12345]         - plain format
        topic = heading
          .gsub(/\[\[(?:Feature|Bug|Misc|Discussion)\s*#\d+\]\]\([^)]*\)/, '')  # [[X #N]](url)
          .gsub(/\[\[(?:Feature|Bug|Misc|Discussion)\s*#\d+\]\([^\]]*\)\]/, '') # [[X #N](url)]
          .gsub(/\[(?:Feature|Bug|Misc|Discussion)\s*#\d+\](?:\([^)]*\))?/, '') # [X #N] or [X #N](url)
          .gsub(/\(.*?\)\s*$/, '')  # trailing (author)
          .strip

        next if topic.empty? || topic =~ /\AAbout release/i
        topics << topic
        break if topics.size >= 3
      end

      if topics.any?
        summary_md = topics.join(" &middot; ")
      else
        # Fallback: use first meaningful paragraph
        text_lines = lines.reject { |l| l.strip.empty? || l.start_with?('#') || l.start_with?('http') || l.start_with?('*') || l.start_with?('-') }
        summary_md = text_lines.first(2).map(&:strip).join(" ")
      end

      summary_md ||= ""

      # Truncate safely: avoid cutting inside backticks or brackets
      if summary_md.length > 200
        truncated = summary_md[0..200]
        # Don't cut inside a backtick pair
        if truncated.count('`').odd?
          last_tick = truncated.rindex('`')
          truncated = truncated[0...last_tick] if last_tick
        end
        # Don't cut inside brackets
        if truncated.count('[') > truncated.count(']')
          last_bracket = truncated.rindex('[')
          truncated = truncated[0...last_bracket] if last_bracket
        end
        summary_md = truncated.rstrip + "..."
      end

      # Render markdown summary to inline HTML (strip wrapping <p> tags)
      @summary_html = md_to_inline_html(summary_md)
      # Also produce a plain text version for search
      @summary_plain = strip_markdown(summary_md)
    end

    # Convert a short markdown string to inline HTML
    def md_to_inline_html(md)
      return "" if md.nil? || md.strip.empty?
      html = Kramdown::Document.new(md, input: 'GFM').to_html.strip
      # Remove wrapping <p>...</p> to keep it inline
      html = html.sub(/\A<p>(.*)<\/p>\z/m, '\1')
      html
    end

    # Strip markdown syntax to produce clean plain text
    def strip_markdown(text)
      text
        .gsub(/```.*?```/m, '')                    # code blocks
        .gsub(/`([^`]+)`/, '\1')                   # inline code -> content
        .gsub(/`/, '')                             # stray backticks
        .gsub(/\[\[([^\]]+)\]\]\(([^)]+)\)/, '\1') # [[text]](url) -> text
        .gsub(/\[([^\]]+)\]\([^)]+\)/, '\1')       # [text](url) -> text
        .gsub(/\[\[([^\]]+)\]\]/, '\1')             # [[text]] -> text
        .gsub(/(?<!\w)[#*~>|]/, '')                # md chars (not mid-word)
        .gsub(/(?<!\w)\*{1,2}|\*{1,2}(?!\w)/, '') # bold/italic asterisks
        .gsub(/(?<=\s)_(?=\S)|(?<=\S)_(?=\s)/, '') # md emphasis underscores (not in identifiers)
        .gsub(/&middot;/, '|')                      # html entity to separator
        .gsub(/\s+/, ' ')                           # normalize whitespace
        .strip
    end

    # Unwrap Google Docs redirect URLs to their real target URLs
    # https://www.google.com/url?q=REAL_URL&sa=D&... -> REAL_URL
    def unwrap_google_redirects(content)
      content.gsub(/https:\/\/www\.google\.com\/url\?q=(.*?)&sa=D[^)\s\]]*/) do
        URI.decode_www_form_component($1)
      end
    end

    # Remove escaped brackets wrapping markdown links (Google Docs artifact)
    # \[[text](url)\] -> [text](url)
    def fix_escaped_bracket_links(content)
      content.gsub(/\\\[(\[[^\]]*\]\([^)]+\))\\\]/) do
        $1
      end
    end

    # Fix unclosed double-bracket links where the second ] is missing
    # [[Bug #123](url) text -> [[Bug #123]](url) text
    def fix_unclosed_bracket_links(content)
      content.gsub(/\[\[((?:Feature|Bug|Misc|Discussion)\s*#\d+)\]\(([^)]+)\)(\s)/) do
        "[[#{$1}]](#{$2})#{$3}"
      end
    end

    # Normalize alternate ticket link format to standard format
    # [[Bug #123](url)] -> [[Bug #123]](url)
    # This ensures Kramdown renders them consistently as proper links
    def normalize_ticket_links(content)
      content.gsub(/\[\[((?:Feature|Bug|Misc|Discussion)\s*#\d+)\]\(([^)]+)\)\]/) do
        "[[#{$1}]](#{$2})"
      end
    end

    def filter_secrets(content)
      # Pattern 1: Modern format - "## Check security tickets\n\n[secret]\n\n## Next section"
      # Remove the entire "Check security tickets" section including the header
      filtered = content.gsub(/^##\s*Check security tickets\s*\n+\[secret\]\s*\n+/m, '')

      # Pattern 2: Older format without ## - "Check security tickets\n[secret]\n"
      filtered = filtered.gsub(/^Check security tickets\s*\n\[secret\]\s*\n+/m, '')

      # Pattern 3: Just a standalone [secret] line
      filtered = filtered.gsub(/^\[secret\]\s*\n+/m, '')

      filtered
    end
  end

  # Jekyll Page subclass for meeting pages
  class MeetingPage < Jekyll::Page
    def initialize(site, base, dir, meeting)
      @site = site
      @base = base
      @dir = dir
      @name = "index.html"

      self.process(@name)
      self.data = {
        "layout" => "meeting",
        "title" => meeting.title,
        "meeting" => meeting.to_liquid,
        "meeting_content" => meeting.content,
        "meeting_lang" => meeting.lang,
      }
    end
  end

  # Jekyll Page subclass for year index pages
  class YearPage < Jekyll::Page
    def initialize(site, base, dir, year, meetings)
      @site = site
      @base = base
      @dir = dir
      @name = "index.html"

      self.process(@name)

      sorted = meetings.sort_by { |m| m.date || Date.new(m.year, 1, 1) }
      by_month = sorted.group_by(&:month).sort_by(&:first)

      self.data = {
        "layout" => "year_index",
        "title" => "#{year} Developer Meetings",
        "year" => year,
        "meetings" => sorted.map(&:to_liquid),
        "meetings_by_month" => by_month.map { |month, ms|
          {
            "month" => month,
            "month_name" => Date::MONTHNAMES[month] || "Unknown",
            "meetings" => ms.map(&:to_liquid),
          }
        },
        "meeting_count" => meetings.size,
      }
    end
  end

  # Main generator plugin
  class Generator < Jekyll::Generator
    safe true
    priority :high

    def generate(site)
      log_path = File.join(site.source, site.config["meeting_log_path"] || "dev-meeting-log")

      unless File.directory?(log_path)
        Jekyll.logger.warn "MeetingGenerator:", "Meeting log directory not found: #{log_path}"
        return
      end

      meetings = []
      Dir.glob(File.join(log_path, "**", "*.md")).each do |file|
        next if File.basename(file) == "README.md"
        begin
          meetings << MeetingData.new(file, log_path)
        rescue => e
          Jekyll.logger.warn "MeetingGenerator:", "Error parsing #{file}: #{e.message}"
        end
      end

      Jekyll.logger.info "MeetingGenerator:", "Found #{meetings.size} meeting logs"

      # Detect language pairs (e.g., DevMeeting-2008-02-15 + DevMeeting-2008-02-15-JA)
      detect_language_pairs!(meetings)

      # Disambiguate titles for months with multiple meetings
      disambiguate_titles!(meetings)

      # Sort meetings by date descending
      all_sorted = meetings.sort_by { |m| m.date || Date.new(m.year, 1, 1) }.reverse

      # Group by year
      by_year = meetings.group_by(&:year).sort_by(&:first).reverse

      # Store data for use in templates
      site.data["meetings"] = all_sorted.map(&:to_liquid)
      site.data["meetings_by_year"] = by_year.map { |year, ms|
        sorted = ms.sort_by { |m| m.date || Date.new(m.year, 1, 1) }.reverse
        { "year" => year, "count" => ms.size, "meetings" => sorted.map(&:to_liquid) }
      }
      site.data["years"] = by_year.map { |year, ms| { "year" => year, "count" => ms.size } }
      site.data["total_meetings"] = meetings.size
      site.data["recent_meetings"] = all_sorted.first(5).map(&:to_liquid)

      # Generate individual meeting pages
      meetings.each do |meeting|
        site.pages << MeetingPage.new(
          site,
          site.source,
          "meetings/#{meeting.year}/#{meeting.slug}",
          meeting
        )
      end

      # Generate year index pages
      by_year.each do |year, year_meetings|
        site.pages << YearPage.new(
          site,
          site.source,
          "meetings/#{year}",
          year,
          year_meetings
        )
      end

      # Generate search index JSON
      generate_search_index(site, all_sorted)
    end

    private

    def disambiguate_titles!(meetings)
      # Group by year+month, and for months with multiple meetings
      # (excluding JA translations), append "#1", "#2" etc.
      by_month = {}
      meetings.each do |m|
        next unless m.date
        next if m.lang == "ja" && m.language_pair  # Skip JA translations that have an EN pair
        key = "#{m.year}-#{format('%02d', m.month)}"
        by_month[key] ||= []
        by_month[key] << m
      end

      by_month.each do |_key, ms|
        next if ms.size < 2
        ms.sort_by! { |m| m.date }
        ms.each_with_index do |m, i|
          m.title = "#{m.title} ##{i + 1}"
        end
      end
    end

    def detect_language_pairs!(meetings)
      # Build a lookup by date + base slug
      by_date = {}
      meetings.each do |m|
        next unless m.date
        key = m.date.to_s
        by_date[key] ||= []
        by_date[key] << m
      end

      by_date.each do |date_str, ms|
        next if ms.size < 2
        en_meeting = ms.find { |m| m.lang == "en" }
        ja_meeting = ms.find { |m| m.lang == "ja" }
        if en_meeting && ja_meeting
          en_meeting.language_pair = ja_meeting.url
          ja_meeting.language_pair = en_meeting.url
        end
      end
    end

    def generate_search_index(site, meetings)
      index = meetings.map do |m|
        # Strip markdown for search content (rough but effective)
        plain_text = m.content
          .gsub(/```.*?```/m, '')     # Remove code blocks
          .gsub(/`[^`]+`/, '')        # Remove inline code
          .gsub(/\[([^\]]+)\]\([^)]+\)/, '\1') # Links to text
          .gsub(/[#*_~>|]/, '')       # Remove markdown chars
          .gsub(/\s+/, ' ')           # Normalize whitespace
          .strip

        {
          "title" => m.title,
          "date" => m.date&.to_s,
          "year" => m.year,
          "url" => m.url,
          "summary" => m.summary_plain,
          "tickets" => m.tickets,
          "content" => plain_text[0..1500],
        }
      end

      search_page = Jekyll::PageWithoutAFile.new(site, site.source, "", "search-index.json")
      search_page.content = JSON.pretty_generate(index)
      search_page.data["layout"] = nil
      site.pages << search_page
    end
  end
end
