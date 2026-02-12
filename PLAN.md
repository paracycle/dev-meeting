# Ruby Dev Meeting Log Website - Implementation Plan

## Overview

Build a Jekyll-based website to display the Ruby developer meeting logs from
https://github.com/ruby/dev-meeting-log with the official Ruby homepage design system.

## Repository Analysis

- **165 meeting logs** spanning Feb 2008 to Jan 2026 (18 years)
- All files are **Markdown (.md)** with YAML frontmatter
- Organized in **year-based directories** (2008/ through 2026/)
- Three filename patterns:
  - `DevMeeting-YYYY-MM-DD.md` (most common)
  - `DevelopersMeeting{YYYYMMDD}Japan.md` (2020-2021)
  - Some with `-JA` suffix (Japanese translations)
- Only **1 meeting** (2008-02-15) has true EN/JA translation pair
- `[secret]` markers appear under "Check security tickets" sections

## Tech Stack

- **Jekyll** (static site generator, GitHub Pages native)
- **jekyll-tailwindcss gem** (no Node.js required)
- **Vanilla JS** client-side search (no external libraries)
- **GitHub Pages** deployment
- **GitHub Actions** for upstream repo sync

## Design System

Uses the official Ruby homepage (ruby/www.ruby-lang.org) design tokens:
- **Primary color**: Ruby Red `#e62923`
- **Secondary color**: Gold/Cream palette
- **Font**: Plus Jakarta Sans
- **Code font**: System monospace stack
- **Dark mode**: Class-based with CSS variables
- **Icons**: Material Symbols Rounded

## Site Structure

```
/                                 # Homepage with recent meetings
/meetings/YYYY/                   # Year index page
/meetings/YYYY/MM-DD/             # Individual meeting page
/archive/                         # Complete chronological archive
/search/                          # Dedicated search page
```

## Key Features

1. **Homepage**: 5 most recent meetings with auto-extracted summaries, year navigation grid
2. **Year Index Pages**: Meetings grouped by month, auto-generated for each year
3. **Meeting Pages**: Full rendered markdown, code highlighting, prev/next nav, breadcrumbs
4. **Language Toggle**: EN/JA switch for meetings with translations (2008-02-15)
5. **Search**: Client-side keyword/issue number search with pre-built JSON index
6. **Secret Filtering**: Remove `[secret]` sections from rendered output
7. **Dark Mode**: System preference detection + manual toggle
8. **Upstream Sync**: GitHub Action polls ruby/dev-meeting-log for changes

## Implementation Steps

1. Set up Jekyll site structure with Gemfile, _config.yml
2. Configure jekyll-tailwindcss with Ruby homepage theme
3. Create CSS variables file matching Ruby homepage colors
4. Build meeting generator plugin (scan dev-meeting-log/, parse files, create pages)
5. Implement secret content filtering
6. Implement language pair detection and toggle
7. Create layouts: default, home, meeting, year-index
8. Create includes: header, footer, meeting-card, search-bar
9. Build client-side search with JSON index generation
10. Create homepage, archive, and search pages
11. Style everything with Tailwind matching Ruby homepage
12. Create GitHub Action for upstream sync
13. Configure for GitHub Pages deployment
