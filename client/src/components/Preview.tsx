import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { asBlob } from "html-docx-js-typescript";
import mermaid from "mermaid";
import { api } from "../services/api";
import { TableOfContents } from "./TableOfContents";
import { useEditorStore } from "../store/editorStore";
import "./Preview.css";

// CodeBlock component with copy functionality
const CodeBlock: React.FC<{ language?: string; children: string }> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(true); // Default to dark to prevent white flash

  // Detect theme for syntax highlighter (including auto/system preference)
  useEffect(() => {
    const updateTheme = () => {
      const theme = document.documentElement.getAttribute("data-theme");
      if (theme === "dark" || theme === "high-contrast") {
        setIsDark(true);
      } else if (theme === "auto" || !theme) {
        // Check system preference
        setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
      } else {
        setIsDark(false);
      }
    };

    updateTheme();

    // Listen for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // Listen for system preference changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", updateTheme);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", updateTheme);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [children]);

  return (
    <div className={`code-block-wrapper ${isDark ? "dark" : "light"}`}>
      <div className="code-block-header">
        <span className="code-language-label">{language || "code"}</span>
        <button
          className={`code-copy-btn ${copied ? "copied" : ""}`}
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy code"}
          aria-label={copied ? "Copied to clipboard" : "Copy code to clipboard"}
        >
          {copied ? "✓ Copied" : "📋 Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={language}
        PreTag="div"
        showLineNumbers={children.split("\n").length > 3}
        wrapLines={true}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: "14px",
          border: "none",
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

type MermaidTheme = "default" | "dark";

let initializedMermaidTheme: MermaidTheme | null = null;

const MAX_MERMAID_CACHE_ENTRIES = 100;
const mermaidSvgCache = new Map<string, { svg: string; bindFunctions?: (element: Element) => void }>();
const mermaidSvgInFlight = new Map<
  string,
  Promise<{ svg: string; bindFunctions?: (element: Element) => void }>
>();

const ensureMermaidInitialized = (theme: MermaidTheme) => {
  if (initializedMermaidTheme === theme) return;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme,
  });

  initializedMermaidTheme = theme;
};

const getCssVar = (name: string, fallback: string) => {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
};

const addSvgBackground = (rawSvg: string, background: string) => {
  // Inject a background rect so exported SVG preserves dark/high-contrast appearance
  // when opened in viewers with a default white canvas.
  const svgTagMatch = rawSvg.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) return rawSvg;

  const svgTag = svgTagMatch[0];
  const hasStyleAttr = /\sstyle\s*=/.test(svgTag);
  const nextSvgTag = hasStyleAttr
    ? svgTag.replace(/\sstyle\s*=\s*"([^"]*)"/i, (_m, styleValue) => {
        const nextStyle = styleValue.includes("background")
          ? styleValue
          : `${styleValue};background:${background}`;
        return ` style="${nextStyle}"`;
      })
    : svgTag.replace(/>$/, ` style="background:${background}">`);

  const withBg = rawSvg.replace(svgTag, `${nextSvgTag}<rect x="0" y="0" width="100%" height="100%" fill="${background}" />`);
  return withBg;
};

const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const [isDark, setIsDark] = useState(true); // Default to dark to prevent white flash
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const bindFunctionsRef = useRef<((element: Element) => void) | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect theme (including auto/system preference)
  useEffect(() => {
    const updateTheme = () => {
      const theme = document.documentElement.getAttribute("data-theme");
      const highContrast = theme === "high-contrast";
      setIsHighContrast(highContrast);

      if (theme === "dark" || highContrast) {
        setIsDark(true);
      } else if (theme === "auto" || !theme) {
        setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
      } else {
        setIsDark(false);
      }
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", updateTheme);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", updateTheme);
    };
  }, []);

  const previewTheme: MermaidTheme = isDark ? "dark" : "default";

  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      try {
        ensureMermaidInitialized(previewTheme);
        const cacheKey = `${previewTheme}::${code}`;

        const cached = mermaidSvgCache.get(cacheKey);
        if (cached) {
          if (cancelled) return;
          bindFunctionsRef.current = cached.bindFunctions;
          setError(null);
          setSvg(cached.svg);
          return;
        }

        const inFlight = mermaidSvgInFlight.get(cacheKey);
        if (inFlight) {
          const result = await inFlight;
          if (cancelled) return;
          bindFunctionsRef.current = result.bindFunctions;
          setError(null);
          setSvg(result.svg);
          return;
        }

        // Mermaid needs a unique ID per render; keep it stable-ish but different per call.
        const renderId = `mmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

        const promise = mermaid
          .render(renderId, code)
          .then((result) => ({ svg: result.svg, bindFunctions: result.bindFunctions }));

        mermaidSvgInFlight.set(cacheKey, promise);
        const result = await promise;
        mermaidSvgInFlight.delete(cacheKey);

        if (cancelled) return;
        bindFunctionsRef.current = result.bindFunctions;
        mermaidSvgCache.set(cacheKey, result);
        if (mermaidSvgCache.size > MAX_MERMAID_CACHE_ENTRIES) {
          const oldestKey = mermaidSvgCache.keys().next().value as string | undefined;
          if (oldestKey) mermaidSvgCache.delete(oldestKey);
        }
        setError(null);
        setSvg(result.svg);
      } catch (e) {
        const cacheKey = `${previewTheme}::${code}`;
        mermaidSvgInFlight.delete(cacheKey);
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setSvg("");
      }
    };

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, previewTheme]);

  useEffect(() => {
    if (!svg) return;
    if (!containerRef.current) return;

    try {
      bindFunctionsRef.current?.(containerRef.current);
    } catch {
      // If binding fails, diagram still renders as static SVG.
    }
  }, [svg]);

  const handleDownloadSvg = useCallback(async () => {
    if (!code) return;

    // Keep the preview's look unchanged, but export an SVG styled for the *current* app mode.
    // This avoids the "all black boxes" look in dark/high-contrast when exported into a white canvas.
    const exportMode = isHighContrast ? "high-contrast" : isDark ? "dark" : "light";

    const bgPrimary = getCssVar("--bg-primary", exportMode === "light" ? "#ffffff" : "#111111");
    const bgSecondary = getCssVar("--bg-secondary", exportMode === "light" ? "#f5f5f5" : "#1f1f1f");
    const bgTertiary = getCssVar("--bg-tertiary", exportMode === "light" ? "#eeeeee" : "#2a2a2a");
    const textPrimary = getCssVar("--text-primary", exportMode === "light" ? "#111111" : "#f5f5f5");
    const textSecondary = getCssVar("--text-secondary", exportMode === "light" ? "#444444" : "#cccccc");
    const borderColor = getCssVar("--border-color", exportMode === "light" ? "#d0d0d0" : "#444444");
    const accentColor = getCssVar("--accent-color", exportMode === "light" ? "#4f46e5" : "#818cf8");
    const fontBody = getCssVar("--font-body", "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");

    const exportKey = [exportMode, bgPrimary, bgSecondary, bgTertiary, textPrimary, borderColor, accentColor].join("|");
    const exportCacheKey = `export:${exportKey}::${code}`;

    try {
      let exportSvg = mermaidSvgCache.get(exportCacheKey)?.svg;
      if (!exportSvg) {
        // Export-only init using base theme + app CSS variables.
        // Use stronger line/border colors than the subtle UI borders so diagrams remain readable.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            fontFamily: fontBody,
            background: bgPrimary,

            primaryColor: bgSecondary,
            primaryTextColor: textPrimary,
            primaryBorderColor: exportMode === "high-contrast" ? textPrimary : borderColor,

            secondaryColor: bgTertiary,
            tertiaryColor: bgPrimary,

            // Make edges/lines readable in dark/high-contrast
            lineColor: exportMode === "light" ? borderColor : textPrimary,
            textColor: textPrimary,

            // Notes / callouts
            noteBkgColor: bgTertiary,
            noteTextColor: textPrimary,
            noteBorderColor: exportMode === "high-contrast" ? textPrimary : borderColor,

            // Some diagram types use these
            actorTextColor: textPrimary,
            actorBkg: bgSecondary,
            actorBorder: exportMode === "high-contrast" ? textPrimary : borderColor,

            // Accents (ignored if unsupported by current Mermaid version)
            linkColor: accentColor,
            titleColor: textSecondary,
          },
        });
        const renderId = `mmd-export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(renderId, code);
        exportSvg = addSvgBackground(result.svg, bgPrimary);
        mermaidSvgCache.set(exportCacheKey, { svg: exportSvg, bindFunctions: result.bindFunctions });
        if (mermaidSvgCache.size > MAX_MERMAID_CACHE_ENTRIES) {
          const oldestKey = mermaidSvgCache.keys().next().value as string | undefined;
          if (oldestKey) mermaidSvgCache.delete(oldestKey);
        }

        // Restore preview theme so subsequent on-screen renders are consistent.
        ensureMermaidInitialized(previewTheme);
      }

      const blob = new Blob([exportSvg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "diagram.svg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export Mermaid SVG:", e);
    }
  }, [code, isDark, isHighContrast, previewTheme]);

  return (
    <div className="mermaid-diagram-wrapper" role="group" aria-label="Mermaid diagram">
      <button
        className="mermaid-download-btn"
        type="button"
        onClick={handleDownloadSvg}
        disabled={!svg}
        aria-label="Download diagram as SVG"
        title={svg ? "Download SVG" : "Diagram not ready"}
      >
        Download SVG
      </button>
      {error ? (
        <div className="mermaid-error" role="alert">
          Mermaid render error: {error}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="mermaid-diagram"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
};

interface PreviewProps {
  pagePath: string | null;
  onNavigate?: (path: string) => void;
}

export const Preview: React.FC<PreviewProps> = ({
  pagePath,
  onNavigate,
}) => {
  const liveContent = useEditorStore((state) => state.content);
  const scrollSource = useEditorStore((state) => state.scrollSource);
  const editorScrollPercent = useEditorStore((state) => state.editorScrollPercent);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Load initial content from API when page changes
  useEffect(() => {
    if (pagePath) {
      loadPage();
    } else {
      setContent("");
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
      console.error("Failed to load page for preview:", error);
    } finally {
      setLoading(false);
    }
  };

  // Sync scroll from editor (smooth)
  useEffect(() => {
    if (contentRef.current && scrollSource === 'editor') {
      const container = contentRef.current;
      const maxScroll = container.scrollHeight - container.clientHeight;
      if (maxScroll > 0) {
        // Use requestAnimationFrame for smoother scrolling
        requestAnimationFrame(() => {
          container.scrollTop = maxScroll * editorScrollPercent;
        });
      }
    }
  }, [scrollSource, editorScrollPercent]);

  // Close export menu when clicking outside
  useEffect(() => {
    if (!showExportMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowExportMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscapeKey);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [showExportMenu]);

  // Open preview in new window
  const openInNewWindow = () => {
    setShowExportMenu(false);
    const newWindow = window.open("", "_blank", "width=900,height=700");
    if (!newWindow) return;

    // Detect current theme
    const currentTheme =
      document.documentElement.getAttribute("data-theme") || "light";
    const isDark = currentTheme === "dark";
    const isHighContrast = currentTheme === "high-contrast";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${pagePath || "Preview"}</title>
          <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
          <style>
            * {
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
              line-height: 1.6;
              color: ${isHighContrast ? "#ffffff" : isDark ? "#f0f0f0" : "#1a1a1a"};
              margin: 0;
              padding: 0;
              background: ${isHighContrast ? "#000000" : isDark ? "#1a1a1a" : "#fff"};
            }

            /* Header */
            .header {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              background: ${isHighContrast ? "#000000" : `linear-gradient(135deg, ${isDark ? "#4a5f8f 0%, #5a3a72 100%" : "#667eea 0%, #764ba2 100%"})`};
              color: white;
              padding: 16px 20px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
              display: flex;
              justify-content: space-between;
              align-items: center;
              z-index: 100;
              ${isHighContrast ? "border-bottom: 2px solid #ffffff;" : ""}
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
              background: ${isHighContrast ? "#000000" : isDark ? "#1a1a1a" : "#fff"};
              border: 1px solid ${isHighContrast ? "#ffffff" : isDark ? "#4a4a4a" : "#ddd"};
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
              color: ${isHighContrast ? "#ffff00" : isDark ? "#c0c0c0" : "#4a4a4a"};
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
              color: ${isHighContrast ? "#00ffff" : isDark ? "#f0f0f0" : "#1a1a1a"};
              background: ${isHighContrast ? "#1a1a1a" : isDark ? "#363636" : "#eee"};
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
              color: ${isHighContrast ? "#ffffff" : isDark ? "#f0f0f0" : "#1a1a1a"};
            }
            h1 { font-size: 2em; border-bottom: 1px solid ${isHighContrast ? "#ffffff" : isDark ? "#4a4a4a" : "#d0d0d0"}; padding-bottom: 0.3em; }
            h2 { font-size: 1.5em; border-bottom: 1px solid ${isHighContrast ? "#ffffff" : isDark ? "#4a4a4a" : "#d0d0d0"}; padding-bottom: 0.3em; }
            h3 { font-size: 1.25em; }
            h4 { font-size: 1em; }
            h5 { font-size: 0.875em; }
            h6 { font-size: 0.85em; color: ${isHighContrast ? "#ffff00" : isDark ? "#c0c0c0" : "#4a4a4a"}; }
            code {
              background: ${isHighContrast ? "#1a1a1a" : isDark ? "#2a2a2a" : "#f5f5f5"};
              padding: 0.2em 0.4em;
              border-radius: 3px;
              font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
              font-size: 85%;
              color: ${isHighContrast ? "#00ffff" : isDark ? "#f0f0f0" : "#1a1a1a"};
              ${isHighContrast ? "border: 1px solid #ffffff;" : ""}
            }
            pre {
              background: ${isHighContrast ? "#1a1a1a" : isDark ? "#2a2a2a" : "#f5f5f5"};
              padding: 16px;
              border-radius: 6px;
              overflow-x: auto;
              line-height: 1.45;
              ${isHighContrast ? "border: 1px solid #ffffff;" : ""}
            }
            pre code {
              background: none;
              padding: 0;
              font-size: 100%;
              ${isHighContrast ? "border: none;" : ""}
            }
            blockquote {
              border-left: 4px solid ${isHighContrast ? "#ffff00" : isDark ? "#4a4a4a" : "#d0d0d0"};
              padding-left: 1em;
              color: ${isHighContrast ? "#ffff00" : isDark ? "#c0c0c0" : "#4a4a4a"};
              margin-left: 0;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 16px 0;
            }
            th, td {
              border: 1px solid ${isHighContrast ? "#ffffff" : isDark ? "#4a4a4a" : "#d0d0d0"};
              padding: 8px 13px;
              text-align: left;
            }
            th {
              background: ${isHighContrast ? "#1a1a1a" : isDark ? "#2a2a2a" : "#f5f5f5"};
              font-weight: 600;
            }
            tr:nth-child(even) {
              background: ${isHighContrast ? "#0d0d0d" : isDark ? "#222222" : "#fafafa"};
            }
            a {
              color: ${isHighContrast ? "#00ffff" : isDark ? "#8a9ff0" : "#5568d3"};
              text-decoration: underline;
            }
            a:hover {
              text-decoration: ${isHighContrast ? "none" : "underline"};
              ${isHighContrast ? "color: #ffff00;" : ""}
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
              border-top: 1px solid ${isHighContrast ? "#ffffff" : isDark ? "#4a4a4a" : "#d0d0d0"};
              margin: 24px 0;
            }
            input[type="checkbox"] {
              margin-right: 0.5em;
            }

            /* Mermaid diagrams */
            .mermaid-diagram-wrapper {
              position: relative;
              margin: 20px 0;
              background: ${isHighContrast ? "#000000" : isDark ? "#1a1a1a" : "#fff"};
              border: 1px solid ${isHighContrast ? "#ffffff" : isDark ? "#4a4a4a" : "#d0d0d0"};
              border-radius: 8px;
              padding: 16px;
              overflow-x: auto;
            }
            .mermaid-download-btn {
              position: absolute;
              top: 10px;
              right: 10px;
              background: transparent;
              border: 1px solid ${isHighContrast ? "#ffffff" : isDark ? "#4a4a4a" : "#d0d0d0"};
              color: ${isHighContrast ? "#ffff00" : isDark ? "#c0c0c0" : "#4a4a4a"};
              padding: 6px 8px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 12px;
              transition: all 0.2s;
            }
            .mermaid-download-btn:hover {
              background: ${isHighContrast ? "#1a1a1a" : isDark ? "#363636" : "#eee"};
              color: ${isHighContrast ? "#00ffff" : isDark ? "#f0f0f0" : "#1a1a1a"};
            }
            .mermaid-error {
              background: ${isHighContrast ? "#1a1a1a" : isDark ? "#2a2a2a" : "#f5f5f5"};
              border: 1px solid ${isHighContrast ? "#ffffff" : isDark ? "#4a4a4a" : "#d0d0d0"};
              border-radius: 6px;
              padding: 12px;
              font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
              font-size: 13px;
              color: ${isHighContrast ? "#ffff00" : isDark ? "#f0f0f0" : "#1a1a1a"};
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📖 ${pagePath?.split("/").pop()?.replace(".md", "") || "Reading Mode"}</h1>
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
            // Security: JSON.stringify() escapes special characters preventing code injection
            // The content is user's own markdown (same-origin), parsed by marked.js which
            // sanitizes HTML output before rendering via innerHTML
            const markdown = ${JSON.stringify(content)};
            const contentDiv = document.getElementById('content');
            contentDiv.innerHTML = marked.parse(markdown);

            // Render Mermaid fenced blocks
            (function renderMermaidDiagrams() {
              if (!window.mermaid) return;

              const isDark = ${JSON.stringify(isDark)};
              const isHighContrast = ${JSON.stringify(isHighContrast)};
              const background = ${JSON.stringify(isHighContrast ? "#000000" : isDark ? "#1a1a1a" : "#fff")};

              window.mermaid.initialize({
                startOnLoad: false,
                securityLevel: 'strict',
                theme: (isDark || isHighContrast) ? 'dark' : 'default',
              });

              function addSvgBackground(rawSvg, bg) {
                const svgTagMatch = rawSvg.match(/<svg\b[^>]*>/i);
                if (!svgTagMatch) return rawSvg;
                const svgTag = svgTagMatch[0];
                const hasStyleAttr = /\sstyle\s*=/.test(svgTag);
                const nextSvgTag = hasStyleAttr
                  ? svgTag.replace(/\sstyle\s*=\s*"([^"]*)"/i, function(_m, styleValue) {
                      const nextStyle = styleValue.indexOf('background') >= 0
                        ? styleValue
                        : (styleValue + ';background:' + bg);
                      return ' style="' + nextStyle + '"';
                    })
                  : svgTag.replace(/>$/, ' style="background:' + bg + '">');

                return rawSvg.replace(svgTag, nextSvgTag + '<rect x="0" y="0" width="100%" height="100%" fill="' + bg + '" />');
              }

              const mermaidBlocks = Array.from(contentDiv.querySelectorAll('pre > code.language-mermaid'));
              mermaidBlocks.forEach(function(codeEl, index) {
                const pre = codeEl.parentElement;
                if (!pre) return;

                const diagramCode = (codeEl.textContent || '').trim();
                const wrapper = document.createElement('div');
                wrapper.className = 'mermaid-diagram-wrapper';

                const btn = document.createElement('button');
                btn.className = 'mermaid-download-btn';
                btn.type = 'button';
                btn.textContent = 'Download SVG';

                const diagram = document.createElement('div');
                diagram.className = 'mermaid-diagram';

                wrapper.appendChild(btn);
                wrapper.appendChild(diagram);
                pre.replaceWith(wrapper);

                btn.addEventListener('click', function() {
                  const svgEl = diagram.querySelector('svg');
                  if (!svgEl) return;
                  const svgText = addSvgBackground(svgEl.outerHTML, background);
                  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'diagram.svg';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                });

                const renderId = 'mmd-win-' + Date.now().toString(36) + '-' + index;
                window.mermaid.render(renderId, diagramCode)
                  .then(function(result) {
                    diagram.innerHTML = result.svg;
                    if (result.bindFunctions) {
                      try { result.bindFunctions(diagram); } catch (e) {}
                    }
                  })
                  .catch(function(err) {
                    const message = (err && err.message) ? err.message : String(err);
                    const errorEl = document.createElement('div');
                    errorEl.className = 'mermaid-error';
                    errorEl.textContent = 'Mermaid render error: ' + message;
                    diagram.replaceWith(errorEl);
                  });
              });
            })();

            // Convert attachment links to absolute URLs
            const folderPath = ${JSON.stringify(pagePath ? pagePath.substring(0, pagePath.lastIndexOf("/")) || "" : "")};
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

    // Security: The html template is safe because:
    // 1. User content is embedded via JSON.stringify() which escapes special chars
    // 2. marked.parse() in the new window sanitizes markdown->HTML conversion
    // 3. The new window is same-origin, operating on user's own content
    // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
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

    const prepareExportClone = async (exportClone: HTMLElement) => {
      // Remove UI-only controls from export output
      exportClone.querySelectorAll('.mermaid-download-btn').forEach((btn) => btn.remove());

      // Convert attachment images to base64 for embedding (docx + stable PDF rendering)
      // Note: Images already have full API URLs from ReactMarkdown component
      const images = exportClone.querySelectorAll('img[src*="/api/attachments/"]');

      for (const img of Array.from(images)) {
        const src = img.getAttribute("src");
        if (src) {
          try {
            const response = await fetch(src, { credentials: "include" });
            if (!response.ok) {
              console.error("Failed to fetch image:", src, response.status);
              continue;
            }
            const blob = await response.blob();

            const imageUrl = URL.createObjectURL(blob);
            const image = new Image();

            await new Promise<void>((resolve, reject) => {
              image.onload = () => resolve();
              image.onerror = reject;
              image.src = imageUrl;
            });

            const maxWidth = 800;
            let width = image.width;
            let height = image.height;

            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(image, 0, 0, width, height);
              const base64 = canvas.toDataURL(blob.type || "image/jpeg", 0.9);
              img.setAttribute("src", base64);
            }

            URL.revokeObjectURL(imageUrl);
          } catch (error) {
            console.error("Failed to embed image:", src, error);
          }
        }
      }

      // Convert Mermaid SVG diagrams into PNG images for export.
      const mermaidWrappers = Array.from(exportClone.querySelectorAll('.mermaid-diagram-wrapper'));
      if (mermaidWrappers.length > 0) {
        const exportMode = (() => {
          const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
          if (currentTheme === 'high-contrast') return 'high-contrast';
          if (currentTheme === 'dark') return 'dark';
          if (currentTheme === 'auto' || !currentTheme) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          }
          return 'light';
        })();

        const background = getCssVar('--bg-primary', exportMode === 'light' ? '#ffffff' : '#111111');

        const parseSvgSize = (svgEl: SVGElement) => {
          const widthAttr = svgEl.getAttribute('width') || '';
          const heightAttr = svgEl.getAttribute('height') || '';
          const viewBoxAttr = svgEl.getAttribute('viewBox') || '';

          const parseNum = (value: string) => {
            const n = Number.parseFloat(value.replace('px', '').trim());
            return Number.isFinite(n) ? n : null;
          };

          const width = parseNum(widthAttr);
          const height = parseNum(heightAttr);
          if (width && height) return { width, height };

          const vb = viewBoxAttr.split(/\s+/).map((s) => Number.parseFloat(s));
          if (vb.length === 4 && vb.every((n) => Number.isFinite(n))) {
            const vbW = vb[2];
            const vbH = vb[3];
            if (vbW > 0 && vbH > 0) return { width: vbW, height: vbH };
          }

          return { width: 800, height: 450 };
        };

        const svgToPngDataUrl = async (svgText: string, bg: string) => {
          const svgWithBg = addSvgBackground(svgText, bg);
          const blob = new Blob([svgWithBg], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          try {
            const image = new Image();
            image.decoding = 'async';

            await new Promise<void>((resolve, reject) => {
              image.onload = () => resolve();
              image.onerror = reject;
              image.src = url;
            });

            const maxWidth = 800;
            let width = image.width || maxWidth;
            let height = image.height || 450;

            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(width));
            canvas.height = Math.max(1, Math.floor(height));

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              return null;
            }

            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            return canvas.toDataURL('image/png', 0.92);
          } finally {
            URL.revokeObjectURL(url);
          }
        };

        for (const wrapper of mermaidWrappers) {
          try {
            const svgEl = wrapper.querySelector('svg') as SVGElement | null;
            if (!svgEl) continue;

            const { width: svgW, height: svgH } = parseSvgSize(svgEl);
            const maxWidth = 800;
            const scale = svgW > maxWidth ? maxWidth / svgW : 1;
            const targetW = svgW * scale;
            const targetH = svgH * scale;

            const svgText = svgEl.outerHTML
              .replace(/\swidth="[^"]*"/i, ` width="${Math.max(1, Math.floor(targetW))}"`)
              .replace(/\sheight="[^"]*"/i, ` height="${Math.max(1, Math.floor(targetH))}"`);

            const pngDataUrl = await svgToPngDataUrl(svgText, background);
            if (!pngDataUrl) continue;

            const img = document.createElement('img');
            img.setAttribute('src', pngDataUrl);
            img.setAttribute('alt', 'Mermaid diagram');

            wrapper.replaceWith(img);
          } catch (e) {
            console.error('Failed to embed Mermaid diagram for export:', e);
          }
        }
      }

      // Ensure all attachment links have absolute URLs with full origin
      const links = exportClone.querySelectorAll('a[href*="/api/attachments/"]');
      for (const link of Array.from(links)) {
        const href = link.getAttribute("href");
        if (href && !href.startsWith("http://") && !href.startsWith("https://")) {
          const absoluteUrl = `${window.location.origin}${href}`;
          link.setAttribute("href", absoluteUrl);
        } else if (href && !href.includes(window.location.origin)) {
          const url = new URL(href, window.location.origin);
          link.setAttribute("href", url.href);
        }
      }
    };

    await prepareExportClone(clone);

    // Security: htmlContent comes from ReactMarkdown which sanitizes markdown->HTML
    // It's the user's own content being exported to Word format, not rendered in browser
    const htmlContent = clone.innerHTML;

    // Create HTML document
    const htmlDoc = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${pagePath || "Document"}</title>
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
    const blob =
      docxBlob instanceof Blob
        ? docxBlob
        : new Blob([new Uint8Array(docxBlob as any)], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });

    // Download the file
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fileName =
      pagePath?.split("/").pop()?.replace(".md", "") || "document";
    a.download = `${fileName}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export to PDF (opens print dialog; user can Save as PDF)
  const exportToPdf = async () => {
    setShowExportMenu(false);

    const previewContent = contentRef.current;
    if (!previewContent) return;

    const clone = previewContent.cloneNode(true) as HTMLElement;

    // Reuse the same export preparation as Word (images + mermaid diagrams)
    const prepareExportClone = async (exportClone: HTMLElement) => {
      exportClone.querySelectorAll('.mermaid-download-btn').forEach((btn) => btn.remove());

      const images = exportClone.querySelectorAll('img[src*="/api/attachments/"]');
      for (const img of Array.from(images)) {
        const src = img.getAttribute("src");
        if (src) {
          try {
            const response = await fetch(src, { credentials: "include" });
            if (!response.ok) continue;
            const blob = await response.blob();

            const imageUrl = URL.createObjectURL(blob);
            const image = new Image();
            await new Promise<void>((resolve, reject) => {
              image.onload = () => resolve();
              image.onerror = reject;
              image.src = imageUrl;
            });

            const maxWidth = 800;
            let width = image.width;
            let height = image.height;
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(image, 0, 0, width, height);
              const base64 = canvas.toDataURL(blob.type || "image/jpeg", 0.9);
              img.setAttribute("src", base64);
            }
            URL.revokeObjectURL(imageUrl);
          } catch {
            // ignore
          }
        }
      }

      const mermaidWrappers = Array.from(exportClone.querySelectorAll('.mermaid-diagram-wrapper'));
      if (mermaidWrappers.length > 0) {
        const exportMode = (() => {
          const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
          if (currentTheme === 'high-contrast') return 'high-contrast';
          if (currentTheme === 'dark') return 'dark';
          if (currentTheme === 'auto' || !currentTheme) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          }
          return 'light';
        })();
        const background = getCssVar('--bg-primary', exportMode === 'light' ? '#ffffff' : '#111111');

        const svgToPngDataUrl = async (svgText: string, bg: string) => {
          const svgWithBg = addSvgBackground(svgText, bg);
          const blob = new Blob([svgWithBg], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          try {
            const image = new Image();
            image.decoding = 'async';
            await new Promise<void>((resolve, reject) => {
              image.onload = () => resolve();
              image.onerror = reject;
              image.src = url;
            });
            const maxWidth = 800;
            let width = image.width || maxWidth;
            let height = image.height || 450;
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(width));
            canvas.height = Math.max(1, Math.floor(height));
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/png', 0.92);
          } finally {
            URL.revokeObjectURL(url);
          }
        };

        for (const wrapper of mermaidWrappers) {
          const svgEl = wrapper.querySelector('svg') as SVGElement | null;
          if (!svgEl) continue;
          const pngDataUrl = await svgToPngDataUrl(svgEl.outerHTML, background);
          if (!pngDataUrl) continue;
          const img = document.createElement('img');
          img.setAttribute('src', pngDataUrl);
          img.setAttribute('alt', 'Mermaid diagram');
          wrapper.replaceWith(img);
        }
      }
    };

    await prepareExportClone(clone);

    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    const dark = currentTheme === "dark" || currentTheme === "high-contrast";

    const htmlContent = clone.innerHTML;
    const htmlDoc = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${pagePath || "Document"}</title>
  <style>
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      line-height: 1.6;
      max-width: 8.5in;
      margin: 0.75in auto;
      padding: 20px;
      color: ${dark ? "#f0f0f0" : "#1a1a1a"};
      background: ${dark ? "#1a1a1a" : "#fff"};
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
      color: ${dark ? "#f0f0f0" : "#000"};
    }
    pre {
      background: ${dark ? "#2a2a2a" : "#f6f8fa"};
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 16px 0;
    }
    code {
      background: ${dark ? "#2a2a2a" : "#f6f8fa"};
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      color: ${dark ? "#f0f0f0" : "#000"};
    }
    a { color: ${dark ? "#8a9ff0" : "#0366d6"}; }
    img {
      max-width: 6.5in;
      width: 100%;
      height: auto;
      display: block;
      margin: 16px auto;
      page-break-inside: avoid;
    }
    @media print {
      body { margin: 0.5in; }
    }
  </style>
</head>
<body>
${htmlContent}
<script>
  (function() {
    function waitForImages() {
      var images = Array.from(document.images || []);
      var pending = images.filter(function(img) { return !img.complete; });
      if (pending.length === 0) return Promise.resolve();
      return Promise.all(pending.map(function(img) {
        return new Promise(function(resolve) {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }));
    }
    window.addEventListener('load', function() {
      waitForImages().then(function() {
        window.focus();
        window.print();
      });
    });
  })();
</script>
</body>
</html>`;

    const newWindow = window.open("", "_blank", "width=900,height=700");
    if (!newWindow) return;
    newWindow.document.write(htmlDoc);
    newWindow.document.close();
  };

  // Handle link clicks in preview
  const handleLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const href = event.currentTarget.getAttribute("href");
    if (!href) return;

    // Handle anchor links (same document)
    if (href.startsWith("#")) {
      event.preventDefault();
      const targetId = href.substring(1);
      // Look for the element within the preview content
      const previewContent = event.currentTarget.closest(".preview-content");
      if (previewContent) {
        const element = previewContent.querySelector(`#${targetId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      return;
    }

    // Handle internal markdown links
    if (
      href.endsWith(".md") &&
      !href.startsWith("http://") &&
      !href.startsWith("https://")
    ) {
      event.preventDefault();

      // Resolve relative path
      let targetPath = href;
      if (pagePath && !href.startsWith("/")) {
        // Relative path - resolve from current page's directory
        const currentDir = pagePath.substring(0, pagePath.lastIndexOf("/"));
        targetPath = currentDir ? `${currentDir}/${href}` : href;
      } else if (href.startsWith("/")) {
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
        <div
          className="preview-actions"
          role="toolbar"
          aria-label="Preview controls"
        >
          {content && <TableOfContents content={content} />}
          {loading && (
            <span
              className="loading-indicator"
              role="status"
              aria-label="Loading"
              aria-live="polite"
            >
              <span aria-hidden="true">●</span>
            </span>
          )}
          <div className="export-dropdown" ref={exportMenuRef}>
            <button
              className="export-dropdown-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              title="Export options"
              aria-label="Export options"
              aria-expanded={showExportMenu}
              aria-haspopup="true"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M9 2L9 3L12.3 3L6 9.3L6.7 10L13 3.7L13 7L14 7L14 2L9 2z" />
                <path d="M12 12L4 12L4 4L7 4L7 3L3 3L3 13L13 13L13 9L12 9L12 12z" />
              </svg>
              <span aria-hidden="true">▼</span>
            </button>
            {showExportMenu && (
              <div
                className="export-menu"
                role="menu"
                aria-label="Export options menu"
              >
                <button
                  className="export-menu-item"
                  onClick={openInNewWindow}
                  role="menuitem"
                  aria-label="Open in new window"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M9 2L9 3L12.3 3L6 9.3L6.7 10L13 3.7L13 7L14 7L14 2L9 2z" />
                    <path d="M12 12L4 12L4 4L7 4L7 3L3 3L3 13L13 13L13 9L12 9L12 12z" />
                  </svg>
                  Open in New Window
                </button>
                <button
                  className="export-menu-item"
                  onClick={exportToPdf}
                  role="menuitem"
                  aria-label="Export to PDF"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M3 2h7l3 3v9H3V2zm7 1.5V6h2.5L10 3.5z" />
                    <path d="M5 8h6v1H5V8zm0 2h6v1H5v-1z" />
                  </svg>
                  Export to PDF
                </button>
                <button
                  className="export-menu-item"
                  onClick={exportToWord}
                  role="menuitem"
                  aria-label="Export to Word document"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M2 2v12h12V2H2zm11 11H3V3h10v10z" />
                    <path d="M4 5h8v1H4V5zm0 2h8v1H4V7zm0 2h5v1H4V9z" />
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
      <div
        ref={contentRef}
        className="preview-content"
        role="region"
        aria-label="Rendered markdown content"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={{
            // Override pre to be a transparent wrapper - our CodeBlock handles all styling
            pre: ({ children }) => <>{children}</>,
            code: ({ node: _node, className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || "");
              const language = match ? match[1] : undefined;
              const codeString = String(children).replace(/\n$/, "");

              // Check if this is an inline code or a code block
              // Code blocks have a parent <pre> element, which ReactMarkdown handles
              // by wrapping the code component. We detect blocks by checking if
              // className exists (language specified) or if content has newlines
              const isCodeBlock = match || codeString.includes("\n");

              if (isCodeBlock) {
                if (language === "mermaid") {
                  return <MermaidBlock code={codeString} />;
                }
                return <CodeBlock language={language}>{codeString}</CodeBlock>;
              }

              // Inline code
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            a: ({ node: _node, ...props }) => {
              const href = props.href || "";
              // Handle attachment links
              if (href.startsWith(".attachments/")) {
                const folderPath = pagePath
                  ? pagePath.substring(0, pagePath.lastIndexOf("/")) || ""
                  : "";
                const filename = href.replace(".attachments/", "");
                const fullUrl = api.getAttachmentUrl(folderPath, filename);
                return (
                  <a
                    {...props}
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                  />
                );
              }
              return <a {...props} onClick={handleLinkClick} />;
            },
            img: ({ node: _node, ...props }) => {
              const src = props.src || "";
              const alt = props.alt || "";

              // Handle attachment images
              if (src.startsWith(".attachments/")) {
                const folderPath = pagePath
                  ? pagePath.substring(0, pagePath.lastIndexOf("/")) || ""
                  : "";
                const filename = src.replace(".attachments/", "");
                const fullUrl = api.getAttachmentUrl(folderPath, filename);

                // Wrap in figure with caption if alt text exists
                if (alt) {
                  return (
                    <figure style={{ margin: "16px 0", textAlign: "center" }}>
                      <img {...props} src={fullUrl} alt={alt} />
                      <figcaption
                        style={{
                          marginTop: "8px",
                          fontSize: "0.9em",
                          color: "var(--text-secondary)",
                          fontStyle: "italic",
                        }}
                      >
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
                  <figure style={{ margin: "16px 0", textAlign: "center" }}>
                    <img {...props} />
                    <figcaption
                      style={{
                        marginTop: "8px",
                        fontSize: "0.9em",
                        color: "var(--text-secondary)",
                        fontStyle: "italic",
                      }}
                    >
                      {alt}
                    </figcaption>
                  </figure>
                );
              }

              return <img {...props} />;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </article>
  );
};
