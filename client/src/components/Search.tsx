import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import { SearchResult } from "../types";
import "./Search.css";

interface SearchProps {
  onSelectPage: (path: string) => void;
}

export const Search: React.FC<SearchProps> = ({ onSelectPage }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut: Cmd+K (Mac) or Ctrl+K (Windows/Linux)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }

      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        setQuery("");
        setResults([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
        setResults([]);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Search with debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const searchResults = await api.search(query);
        setResults(searchResults);
        setSelectedIndex(0);
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelectResult(results[selectedIndex]);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    onSelectPage(result.path);
    setIsOpen(false);
    setQuery("");
    setResults([]);
  };

  return (
    <>
      <button
        className="search-trigger"
        onClick={() => setIsOpen(true)}
        title="Search (⌘K)"
        aria-label="Search pages (keyboard shortcut: Command K)"
      >
        <span className="search-icon" aria-hidden="true">
          🔍
        </span>
        <span className="search-hint">Search...</span>
        <span className="search-shortcut" aria-hidden="true">
          ⌘K
        </span>
      </button>

      {isOpen && (
        <div
          className="search-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-label"
        >
          <div className="search-modal" ref={modalRef}>
            <div className="search-input-container">
              <span className="search-input-icon" aria-hidden="true">
                🔍
              </span>
              <input
                ref={inputRef}
                type="text"
                className="search-input"
                placeholder="Search pages..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Search input"
                id="search-label"
              />
              {isSearching && (
                <span
                  className="search-spinner"
                  aria-label="Searching"
                  role="status"
                  aria-live="polite"
                  aria-hidden="true"
                >
                  ⏳
                </span>
              )}
            </div>

            {results.length > 0 && (
              <div
                className="search-results"
                role="listbox"
                aria-label="Search results"
              >
                {results.map((result, index) => (
                  <div
                    key={result.path}
                    className={`search-result ${index === selectedIndex ? "selected" : ""}`}
                    onClick={() => handleSelectResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    role="option"
                    aria-selected={index === selectedIndex}
                  >
                    <div className="search-result-header">
                      <span className="search-result-title">
                        {result.title}
                      </span>
                      <span className="search-result-matches">
                        {result.matches} match{result.matches > 1 ? "es" : ""}
                      </span>
                    </div>
                    <div className="search-result-path">{result.path}</div>
                    <div
                      className="search-result-snippet"
                      dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                  </div>
                ))}
              </div>
            )}

            {query && !isSearching && results.length === 0 && (
              <div className="search-no-results">
                No results found for "{query}"
              </div>
            )}

            <div className="search-footer">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
