import React, { useState, useEffect, useRef } from "react";
import GithubSlugger from "github-slugger";
import "./TableOfContents.css";

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({
  content,
}) => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isCollapsed, setIsCollapsed] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Extract headings from markdown content
  useEffect(() => {
    const lines = content.split("\n");
    const extractedHeadings: Heading[] = [];
    const slugger = new GithubSlugger();

    lines.forEach((line) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        // Use the same slugger as rehype-slug for consistent IDs
        const id = slugger.slug(text);
        extractedHeadings.push({ id, text, level });
      }
    });

    setHeadings(extractedHeadings);
  }, [content]);

  // Track active section based on scroll position
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-100px 0px -80% 0px",
      },
    );

    // Observe all heading elements in the preview
    headings.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [headings]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsCollapsed(true);
      }
    };

    if (!isCollapsed) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCollapsed]);

  // Save collapsed state
  useEffect(() => {
    localStorage.setItem("disnotion-toc-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (headings.length === 0) {
    return null;
  }

  return (
    <div className="table-of-contents">
      <button
        className="toc-toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title="Table of contents"
        aria-label="Table of contents"
        aria-expanded={!isCollapsed}
        aria-controls="toc-dropdown"
      >
        <span aria-hidden="true">☰</span> Contents
      </button>

      {!isCollapsed && (
        <div className="toc-dropdown" id="toc-dropdown" ref={dropdownRef}>
          <nav className="toc-nav" aria-label="Table of contents navigation">
            <ul className="toc-list" role="list">
              {headings.map((heading) => (
                <li
                  key={heading.id}
                  className={`toc-item toc-level-${heading.level} ${
                    activeId === heading.id ? "active" : ""
                  }`}
                >
                  <button
                    onClick={() => {
                      handleClick(heading.id);
                      setIsCollapsed(true);
                    }}
                    className="toc-link"
                  >
                    {heading.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
};
