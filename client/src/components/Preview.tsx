import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { asBlob } from 'html-docx-js-typescript';
import { api } from '../services/api';
import { TableOfContents } from './TableOfContents';
import './Preview.css';

interface PreviewProps {
  pagePath: string | null;
  liveContent?: string;
  onNavigate?: (path: string) => void;
  scrollPercent?: number;
}

export const Preview: React.FC<PreviewProps> = ({ pagePath, liveContent, onNavigate, scrollPercent }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Load initial content from API when page changes
  useEffect(() => {
    if (pagePath) {
      loadPage();
    } else {
      setContent('');
    }
  }, [pagePath]);

  // Use live content when available (from editor) - overrides loaded content
  useEffect(() => {
    if (liveContent !== undefined) {
      setContent(liveContent);
    }
  }, [liveContent]);

  const loadPage = async () => {
    if (!pagePath) return;

    setLoading(true);
    try {
      const page = await api.getPage(pagePath);
      setContent(page.content);
    } catch (error) {
      console.error('Failed to load page for preview:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sync scroll from editor (smooth)
  useEffect(() => {
    if (contentRef.current && scrollPercent !== undefined) {
      const container = contentRef.current;
      const maxScroll = container.scrollHeight - container.clientHeight;
      if (maxScroll > 0) {
        // Use requestAnimationFrame for smoother scrolling
        requestAnimationFrame(() => {
          container.scrollTop = maxScroll * scrollPercent;
        });
      }
    }
  }, [scrollPercent]);

  // Close export menu when clicking outside
  useEffect(() => {
    if (!showExportMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [showExportMenu]);

  // Open preview in new window
  const openInNewWindow = () => {
    setShowExportMenu(false);
    const newWindow = window.open('', '_blank', 'width=900,height=700');
    if (!newWindow) return;

    // Detect current theme
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = currentTheme === 'dark';
    const isHighContrast = currentTheme === 'high-contrast';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${pagePath || 'Preview'}</title>
          <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
          <style>
            * {
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
              line-height: 1.6;
              color: ${isHighContrast ? '#ffffff' : isDark ? '#f0f0f0' : '#1a1a1a'};
              margin: 0;
              padding: 0;
              background: ${isHighContrast ? '#000000' : isDark ? '#1a1a1a' : '#fff'};
            }

            /* Header */
            .header {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              background: ${isHighContrast ? '#000000' : `linear-gradient(135deg, ${isDark ? '#4a5f8f 0%, #5a3a72 100%' : '#667eea 0%, #764ba2 100%'})`};
              color: white;
              padding: 16px 20px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
              display: flex;
              justify-content: space-between;
              align-items: center;
              z-index: 100;
              ${isHighContrast ? 'border-bottom: 2px solid #ffffff;' : ''}
            }
            .header h1 {
              margin: 0;
              font-size: 18px;
              font-weight: 600;
              color: white;
              border: none;
              padding: 0;
            }
            .header-actions {
              display: flex;
              gap: 10px;
              align-items: center;
            }

            /* TOC Button */
            .toc-toggle {
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 6px 12px;
              background: rgba(255, 255, 255, 0.2);
              border: 1px solid rgba(255, 255, 255, 0.3);
              border-radius: 4px;
              color: white;
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
              white-space: nowrap;
            }
            .toc-toggle:hover {
              background: rgba(255, 255, 255, 0.3);
            }

            /* TOC Dropdown */
            .toc-container {
              position: relative;
              display: inline-block;
            }
            .toc-dropdown {
              display: none;
              position: absolute;
              top: calc(100% + 8px);
              right: 0;
              background: ${isHighContrast ? '#000000' : isDark ? '#1a1a1a' : '#fff'};
              border: 1px solid ${isHighContrast ? '#ffffff' : isDark ? '#4a4a4a' : '#ddd'};
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
              min-width: 280px;
              max-width: 400px;
              max-height: 400px;
              overflow-y: auto;
              z-index: 1000;
              padding: 12px;
            }
            .toc-dropdown.show {
              display: block;
            }
            .toc-list {
              list-style: none;
              margin: 0;
              padding: 0;
            }
            .toc-item {
              margin: 0;
            }
            .toc-link {
              display: block;
              width: 100%;
              padding: 6px 8px;
              background: transparent;
              border: none;
              color: ${isHighContrast ? '#ffff00' : isDark ? '#c0c0c0' : '#4a4a4a'};
              text-align: left;
              text-decoration: none;
              border-radius: 4px;
              font-size: 13px;
              line-height: 1.4;
              transition: all 0.2s;
              border-left: 2px solid transparent;
              cursor: pointer;
            }
            .toc-link:hover {
              color: ${isHighContrast ? '#00ffff' : isDark ? '#f0f0f0' : '#1a1a1a'};
              background: ${isHighContrast ? '#1a1a1a' : isDark ? '#363636' : '#eee'};
            }
            .toc-level-1 { padding-left: 0; }
            .toc-level-2 { padding-left: 12px; }
            .toc-level-3 { padding-left: 24px; }
            .toc-level-4 { padding-left: 36px; }
            .toc-level-5 { padding-left: 48px; }
            .toc-level-6 { padding-left: 60px; }

            /* Content */
            .content-wrapper {
              max-width: 800px;
              margin: 0 auto;
              padding: 70px 20px 20px 20px;
            }

            h1, h2, h3, h4, h5, h6 {
              margin-top: 24px;
              margin-bottom: 16px;
              font-weight: 600;
              line-height: 1.25;
              color: ${isHighContrast ? '#ffffff' : isDark ? '#f0f0f0' : '#1a1a1a'};
            }
            h1 { font-size: 2em; border-bottom: 1px solid ${isHighContrast ? '#ffffff' : isDark ? '#4a4a4a' : '#d0d0d0'}; padding-bottom: 0.3em; }
            h2 { font-size: 1.5em; border-bottom: 1px solid ${isHighContrast ? '#ffffff' : isDark ? '#4a4a4a' : '#d0d0d0'}; padding-bottom: 0.3em; }
            h3 { font-size: 1.25em; }
            h4 { font-size: 1em; }
            h5 { font-size: 0.875em; }
            h6 { font-size: 0.85em; color: ${isHighContrast ? '#ffff00' : isDark ? '#c0c0c0' : '#4a4a4a'}; }
            code {
              background: ${isHighContrast ? '#1a1a1a' : isDark ? '#2a2a2a' : '#f5f5f5'};
              padding: 0.2em 0.4em;
              border-radius: 3px;
              font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
              font-size: 85%;
              color: ${isHighContrast ? '#00ffff' : isDark ? '#f0f0f0' : '#1a1a1a'};
              ${isHighContrast ? 'border: 1px solid #ffffff;' : ''}
            }
            pre {
              background: ${isHighContrast ? '#1a1a1a' : isDark ? '#2a2a2a' : '#f5f5f5'};
              padding: 16px;
              border-radius: 6px;
              overflow-x: auto;
              line-height: 1.45;
              ${isHighContrast ? 'border: 1px solid #ffffff;' : ''}
            }
            pre code {
              background: none;
              padding: 0;
              font-size: 100%;
              ${isHighContrast ? 'border: none;' : ''}
            }
            blockquote {
              border-left: 4px solid ${isHighContrast ? '#ffff00' : isDark ? '#4a4a4a' : '#d0d0d0'};
              padding-left: 1em;
              color: ${isHighContrast ? '#ffff00' : isDark ? '#c0c0c0' : '#4a4a4a'};
              margin-left: 0;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 16px 0;
            }
            th, td {
              border: 1px solid ${isHighContrast ? '#ffffff' : isDark ? '#4a4a4a' : '#d0d0d0'};
              padding: 8px 13px;
              text-align: left;
            }
            th {
              background: ${isHighContrast ? '#1a1a1a' : isDark ? '#2a2a2a' : '#f5f5f5'};
              font-weight: 600;
            }
            tr:nth-child(even) {
              background: ${isHighContrast ? '#0d0d0d' : isDark ? '#222222' : '#fafafa'};
            }
            a {
              color: ${isHighContrast ? '#00ffff' : isDark ? '#8a9ff0' : '#5568d3'};
              text-decoration: underline;
            }
            a:hover {
              text-decoration: ${isHighContrast ? 'none' : 'underline'};
              ${isHighContrast ? 'color: #ffff00;' : ''}
            }
            img {
              max-width: 100%;
              height: auto;
            }
            ul, ol {
              padding-left: 2em;
            }
            li {
              margin: 0.25em 0;
            }
            hr {
              border: 0;
              border-top: 1px solid ${isHighContrast ? '#ffffff' : isDark ? '#4a4a4a' : '#d0d0d0'};
              margin: 24px 0;
            }
            input[type="checkbox"] {
              margin-right: 0.5em;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📖 ${pagePath?.split('/').pop()?.replace('.md', '') || 'Reading Mode'}</h1>
            <div class="header-actions">
              <div class="toc-container">
                <button class="toc-toggle" id="tocToggle">☰ Contents</button>
                <div class="toc-dropdown" id="tocDropdown">
                  <ul class="toc-list" id="tocList"></ul>
                </div>
              </div>
            </div>
          </div>
          <div class="content-wrapper">
            <div id="content"></div>
          </div>
          <script>
            // Render the markdown
            const markdown = ${JSON.stringify(content)};
            const contentDiv = document.getElementById('content');
            contentDiv.innerHTML = marked.parse(markdown);

            // Convert attachment links to absolute URLs
            const folderPath = ${JSON.stringify(pagePath ? pagePath.substring(0, pagePath.lastIndexOf('/')) || '' : '')};
            contentDiv.querySelectorAll('img[src^=".attachments/"]').forEach(function(img) {
              const filename = img.getAttribute('src').replace('.attachments/', '');
              img.src = window.location.origin + '/api/attachments/' + encodeURIComponent(filename) + '?folder=' + encodeURIComponent(folderPath);
            });
            contentDiv.querySelectorAll('a[href^=".attachments/"]').forEach(function(link) {
              const filename = link.getAttribute('href').replace('.attachments/', '');
              link.href = window.location.origin + '/api/attachments/' + encodeURIComponent(filename) + '?folder=' + encodeURIComponent(folderPath);
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
            });

            // Add IDs to headings using github-slugger algorithm
            const slugs = new Map();
            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(function(heading) {
              if (!heading.id) {
                const text = heading.textContent || '';
                let slug = text.toLowerCase()
                  .replace(/[^a-z0-9\\s-]/g, '')
                  .replace(/\\s+/g, '-')
                  .replace(/-+/g, '-')
                  .trim();

                // Handle duplicates
                let uniqueSlug = slug;
                let count = slugs.get(slug) || 0;
                if (count > 0) {
                  uniqueSlug = slug + '-' + count;
                }
                slugs.set(slug, count + 1);

                heading.id = uniqueSlug;
              }
            });

            // Build TOC
            const tocList = document.getElementById('tocList');
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            headings.forEach(function(heading) {
              const level = parseInt(heading.tagName.substring(1));
              const li = document.createElement('li');
              li.className = 'toc-item toc-level-' + level;

              const button = document.createElement('button');
              button.className = 'toc-link';
              button.textContent = heading.textContent;
              button.onclick = function() {
                heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                document.getElementById('tocDropdown').classList.remove('show');
              };

              li.appendChild(button);
              tocList.appendChild(li);
            });

            // TOC toggle
            const tocToggle = document.getElementById('tocToggle');
            const tocDropdown = document.getElementById('tocDropdown');

            tocToggle.addEventListener('click', function(e) {
              e.stopPropagation();
              tocDropdown.classList.toggle('show');
            });

            // Close TOC when clicking outside
            document.addEventListener('click', function(e) {
              if (!e.target.closest('.toc-container')) {
                tocDropdown.classList.remove('show');
              }
            });

            // Handle all link clicks
            document.addEventListener('click', function(e) {
              if (e.target.tagName === 'A') {
                const href = e.target.getAttribute('href');
                if (!href) return;

                // Handle anchor links - scroll to the element
                if (href.startsWith('#')) {
                  e.preventDefault();
                  const targetId = href.substring(1);
                  const targetElement = document.getElementById(targetId);
                  if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                  return;
                }

                // External links (http/https) open normally
                if (href.startsWith('http://') || href.startsWith('https://')) {
                  return;
                }

                // All other links cannot be navigated from this window
                e.preventDefault();
                alert('This link cannot be navigated from this window.\\n\\nPlease use the main application to navigate between pages.');
              }
            });
          </script>
        </body>
      </html>
    `;

    newWindow.document.write(html);
    newWindow.document.close();
  };

  // Export to Word document
  const exportToWord = async () => {
    setShowExportMenu(false);

    // Get the rendered HTML content from the preview
    const previewContent = contentRef.current;
    if (!previewContent) return;

    // Clone the content and get its HTML
    const clone = previewContent.cloneNode(true) as HTMLElement;

    // Convert attachment images to base64 for embedding in .docx
    // Note: Images already have full API URLs from ReactMarkdown component
    const images = clone.querySelectorAll('img[src*="/api/attachments/"]');

    for (const img of Array.from(images)) {
      const src = img.getAttribute('src');
      if (src) {
        try {
          // Fetch the image as blob (URL already includes credentials)
          const response = await fetch(src, { credentials: 'include' });
          if (!response.ok) {
            console.error('Failed to fetch image:', src, response.status);
            continue;
          }
          const blob = await response.blob();

          // Load image to get dimensions and resize if needed
          const imageUrl = URL.createObjectURL(blob);
          const image = new Image();

          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = reject;
            image.src = imageUrl;
          });

          // Resize image if it's too large (max width 800px for Word compatibility)
          const maxWidth = 800;
          let width = image.width;
          let height = image.height;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          // Create canvas and draw resized image
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(image, 0, 0, width, height);
            const base64 = canvas.toDataURL(blob.type || 'image/jpeg', 0.9);
            img.setAttribute('src', base64);
          }

          URL.revokeObjectURL(imageUrl);
        } catch (error) {
          console.error('Failed to embed image:', src, error);
        }
      }
    }

    // Ensure all attachment links have absolute URLs with full origin
    // Even though ReactMarkdown converts them, we need to ensure they have the full origin
    const links = clone.querySelectorAll('a[href*="/api/attachments/"]');
    for (const link of Array.from(links)) {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http://') && !href.startsWith('https://')) {
        // Add the origin if it's a relative URL
        const absoluteUrl = `${window.location.origin}${href}`;
        link.setAttribute('href', absoluteUrl);
      } else if (href && !href.includes(window.location.origin)) {
        // Ensure it has the current origin
        const url = new URL(href, window.location.origin);
        link.setAttribute('href', url.href);
      }
    }

    const htmlContent = clone.innerHTML;

    // Create HTML document
    const htmlDoc = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${pagePath || 'Document'}</title>
  <style>
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      line-height: 1.6;
      max-width: 8.5in;
      margin: 1in auto;
      padding: 20px;
      color: #1a1a1a;
      background: #fff;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
      color: #000;
    }
    h1 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }
    h5 { font-size: 0.875em; }
    h6 { font-size: 0.85em; color: #666; }
    p { margin-top: 0; margin-bottom: 16px; }
    code {
      background: #f6f8fa;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      color: #000;
    }
    pre {
      background: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 16px 0;
    }
    pre code {
      background: transparent;
      padding: 0;
      color: #000;
    }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 16px;
      margin: 16px 0;
      color: #666;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
    }
    table th,
    table td {
      border: 1px solid #ddd;
      padding: 8px 12px;
      text-align: left;
    }
    table th {
      background: #f6f8fa;
      font-weight: 600;
    }
    a {
      color: #0366d6;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    ul, ol {
      padding-left: 2em;
      margin: 16px 0;
    }
    li {
      margin: 4px 0;
    }
    hr {
      border: 0;
      border-top: 1px solid #ddd;
      margin: 24px 0;
    }
    img {
      max-width: 6.5in;
      width: 100%;
      height: auto;
      display: block;
      margin: 16px auto;
    }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`;

    // Convert HTML to .docx blob
    const docxBlob = await asBlob(htmlDoc);

    // Ensure it's a proper Blob (library returns Buffer in browser)
    const blob = docxBlob instanceof Blob ? docxBlob : new Blob([new Uint8Array(docxBlob as any)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    // Download the file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = pagePath?.split('/').pop()?.replace('.md', '') || 'document';
    a.download = `${fileName}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle link clicks in preview
  const handleLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const href = event.currentTarget.getAttribute('href');
    if (!href) return;

    // Handle anchor links (same document)
    if (href.startsWith('#')) {
      event.preventDefault();
      const targetId = href.substring(1);
      // Look for the element within the preview content
      const previewContent = event.currentTarget.closest('.preview-content');
      if (previewContent) {
        const element = previewContent.querySelector(`#${targetId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      return;
    }

    // Handle internal markdown links
    if (href.endsWith('.md') && !href.startsWith('http://') && !href.startsWith('https://')) {
      event.preventDefault();

      // Resolve relative path
      let targetPath = href;
      if (pagePath && !href.startsWith('/')) {
        // Relative path - resolve from current page's directory
        const currentDir = pagePath.substring(0, pagePath.lastIndexOf('/'));
        targetPath = currentDir ? `${currentDir}/${href}` : href;
      } else if (href.startsWith('/')) {
        // Absolute path - remove leading slash
        targetPath = href.substring(1);
      }

      if (onNavigate) {
        onNavigate(targetPath);
      }
    }
    // External links open normally (default behavior)
  };

  if (!pagePath) {
    return (
      <div className="preview empty" role="status">
        <div className="empty-state">
          <p>Preview will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <article className="preview" aria-label="Markdown preview">
      <div className="preview-header">
        <h3>Preview</h3>
        <div className="preview-actions" role="toolbar" aria-label="Preview controls">
          {content && <TableOfContents content={content} />}
          {loading && <span className="loading-indicator" role="status" aria-label="Loading" aria-live="polite"><span aria-hidden="true">●</span></span>}
          <div className="export-dropdown" ref={exportMenuRef}>
            <button
              className="export-dropdown-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              title="Export options"
              aria-label="Export options"
              aria-expanded={showExportMenu}
              aria-haspopup="true"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M9 2L9 3L12.3 3L6 9.3L6.7 10L13 3.7L13 7L14 7L14 2L9 2z"/>
                <path d="M12 12L4 12L4 4L7 4L7 3L3 3L3 13L13 13L13 9L12 9L12 12z"/>
              </svg>
              <span aria-hidden="true">▼</span>
            </button>
            {showExportMenu && (
              <div className="export-menu" role="menu" aria-label="Export options menu">
                <button
                  className="export-menu-item"
                  onClick={openInNewWindow}
                  role="menuitem"
                  aria-label="Open in new window"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M9 2L9 3L12.3 3L6 9.3L6.7 10L13 3.7L13 7L14 7L14 2L9 2z"/>
                    <path d="M12 12L4 12L4 4L7 4L7 3L3 3L3 13L13 13L13 9L12 9L12 12z"/>
                  </svg>
                  Open in New Window
                </button>
                <button
                  className="export-menu-item"
                  onClick={exportToWord}
                  role="menuitem"
                  aria-label="Export to Word document"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M2 2v12h12V2H2zm11 11H3V3h10v10z"/>
                    <path d="M4 5h8v1H4V5zm0 2h8v1H4V7zm0 2h5v1H4V9z"/>
                  </svg>
                  Export to Word
                </button>
              </div>
            )}
          </div>
          <button
            className="sync-scroll-btn"
            onClick={() => {
              if (contentRef.current) {
                contentRef.current.scrollTop = 0;
              }
            }}
            title="Scroll to top"
            aria-label="Scroll preview to top"
          >
            <span aria-hidden="true">↑</span>
          </button>
        </div>
      </div>
      <div ref={contentRef} className="preview-content" role="region" aria-label="Rendered markdown content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={{
            a: ({ node: _node, ...props }) => {
              const href = props.href || '';
              // Handle attachment links
              if (href.startsWith('.attachments/')) {
                const folderPath = pagePath ? pagePath.substring(0, pagePath.lastIndexOf('/')) || '' : '';
                const filename = href.replace('.attachments/', '');
                const fullUrl = api.getAttachmentUrl(folderPath, filename);
                return <a {...props} href={fullUrl} target="_blank" rel="noopener noreferrer" download />;
              }
              return <a {...props} onClick={handleLinkClick} />;
            },
            img: ({ node: _node, ...props }) => {
              const src = props.src || '';
              const alt = props.alt || '';

              // Handle attachment images
              if (src.startsWith('.attachments/')) {
                const folderPath = pagePath ? pagePath.substring(0, pagePath.lastIndexOf('/')) || '' : '';
                const filename = src.replace('.attachments/', '');
                const fullUrl = api.getAttachmentUrl(folderPath, filename);

                // Wrap in figure with caption if alt text exists
                if (alt) {
                  return (
                    <figure style={{ margin: '16px 0', textAlign: 'center' }}>
                      <img {...props} src={fullUrl} alt={alt} />
                      <figcaption style={{
                        marginTop: '8px',
                        fontSize: '0.9em',
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic'
                      }}>
                        {alt}
                      </figcaption>
                    </figure>
                  );
                }
                return <img {...props} src={fullUrl} alt={filename} />;
              }

              // For non-attachment images, still show caption if alt text exists
              if (alt) {
                return (
                  <figure style={{ margin: '16px 0', textAlign: 'center' }}>
                    <img {...props} />
                    <figcaption style={{
                      marginTop: '8px',
                      fontSize: '0.9em',
                      color: 'var(--text-secondary)',
                      fontStyle: 'italic'
                    }}>
                      {alt}
                    </figcaption>
                  </figure>
                );
              }

              return <img {...props} />;
            }
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </article>
  );
};
