import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import "./Attachments.css";

interface Attachment {
  name: string;
  size: number;
  modified: Date;
}

interface AttachmentsProps {
  folderPath: string;
  onClose: () => void;
  onInsert?: (filename: string) => void;
}

export const Attachments: React.FC<AttachmentsProps> = ({
  folderPath,
  onClose,
  onInsert,
}) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAttachments();
  }, [folderPath]);

  const loadAttachments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAttachments(folderPath);
      setAttachments(data);
    } catch (err) {
      console.error("Failed to load attachments:", err);
      setError("Failed to load attachments");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        await api.uploadAttachment(folderPath, files[i]);
      }
      await loadAttachments();
    } catch (err) {
      console.error("Upload failed:", err);
      setError("Failed to upload files");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;

    try {
      await api.deleteAttachment(folderPath, filename);
      await loadAttachments();
    } catch (err) {
      console.error("Delete failed:", err);
      setError("Failed to delete file");
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileIcon = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || ""))
      return "🖼️";
    if (["pdf"].includes(ext || "")) return "📄";
    if (["doc", "docx"].includes(ext || "")) return "📝";
    if (["xls", "xlsx"].includes(ext || "")) return "📊";
    if (["zip", "rar", "7z"].includes(ext || "")) return "📦";
    return "📎";
  };

  const handleInsertLink = (filename: string) => {
    if (onInsert) {
      onInsert(filename);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="attachments-title"
    >
      <div
        className="modal attachments-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="attachments-title">📎 Attachments</h3>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close attachments modal"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <span>⚠️</span> {error}
            <button onClick={() => setError(null)} aria-label="Dismiss error">
              ✕
            </button>
          </div>
        )}

        <div className="modal-body">
          {/* Upload Area */}
          <div
            className={`upload-area ${dragActive ? "drag-active" : ""}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload files area. Click to select files or drag and drop"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              style={{ display: "none" }}
              aria-label="File input"
            />
            {uploading ? (
              <div className="upload-status" role="status" aria-live="polite">
                <div className="spinner"></div>
                <p>Uploading...</p>
              </div>
            ) : (
              <>
                <div className="upload-icon" aria-hidden="true">
                  📤
                </div>
                <p>
                  <strong>Drop files here</strong> or click to browse
                </p>
                <p className="upload-hint">Up to 50MB per file</p>
              </>
            )}
          </div>

          {/* Attachments List */}
          <div className="attachments-list">
            {loading && !attachments.length ? (
              <div className="loading-state" role="status" aria-live="polite">
                <div className="spinner"></div>
                <p>Loading attachments...</p>
              </div>
            ) : attachments.length === 0 ? (
              <div className="empty-state" role="status">
                <p>No attachments yet</p>
              </div>
            ) : (
              <ul role="list">
                {attachments.map((file) => (
                  <li key={file.name} className="attachment-item">
                    <span className="file-icon" aria-hidden="true">
                      {getFileIcon(file.name)}
                    </span>
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-meta">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                    <div className="file-actions">
                      <button
                        onClick={() => handleInsertLink(file.name)}
                        className="btn-insert"
                        title="Insert link to editor"
                        aria-label={`Insert link to ${file.name}`}
                      >
                        Insert
                      </button>
                      <a
                        href={api.getAttachmentUrl(folderPath, file.name)}
                        download={file.name}
                        className="btn-download"
                        title="Download"
                        aria-label={`Download ${file.name}`}
                      >
                        ⬇️
                      </a>
                      <button
                        onClick={() => handleDelete(file.name)}
                        className="btn-delete"
                        title="Delete"
                        aria-label={`Delete ${file.name}`}
                      >
                        🗑️
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
