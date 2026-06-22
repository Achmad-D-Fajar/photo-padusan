"use client";

import { useState } from "react";

interface Photo {
  id: string;
  image_url: string;
  caption: string;
  tags: string[];
  created_at: string;
}

interface PhotoGridProps {
  initialPhotos: Photo[];
}

type ModalMode = "view" | "edit";

export default function PhotoGrid({ initialPhotos }: PhotoGridProps) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [mode, setMode] = useState<ModalMode>("view");
  const [editCaption, setEditCaption] = useState("");
  const [editTags, setEditTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function openModal(photo: Photo) {
    setSelectedPhoto(photo);
    setMode("view");
    setEditCaption(photo.caption || "");
    setEditTags(Array.isArray(photo.tags) ? photo.tags.join(", ") : "");
    setErrorMessage("");
  }

  function closeModal() {
    setSelectedPhoto(null);
    setMode("view");
    setErrorMessage("");
    setIsSaving(false);
    setIsDeleting(false);
  }

  function startEdit() {
    setMode("edit");
    setErrorMessage("");
  }

  function cancelEdit() {
    if (selectedPhoto) {
      setEditCaption(selectedPhoto.caption || "");
      setEditTags(
        Array.isArray(selectedPhoto.tags) ? selectedPhoto.tags.join(", ") : ""
      );
    }
    setMode("view");
    setErrorMessage("");
  }

  async function handleSave() {
    if (!selectedPhoto) return;

    if (editCaption.trim().length === 0) {
      setErrorMessage("Caption cannot be empty.");
      return;
    }

    const parsedTags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 8);

    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/photos/${selectedPhoto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: editCaption.trim(),
          tags: parsedTags,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update photo.");
      }

      const updatedPhoto: Photo = result.data;

      setPhotos((prev) =>
        prev.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p))
      );
      setSelectedPhoto(updatedPhoto);
      setMode("view");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unknown error occurred."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedPhoto) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this photo? This action cannot be undone."
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/photos/${selectedPhoto.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete photo.");
      }

      setPhotos((prev) => prev.filter((p) => p.id !== selectedPhoto.id));
      closeModal();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unknown error occurred."
      );
      setIsDeleting(false);
    }
  }

  if (photos.length === 0) {
    return (
      <div className="hero bg-base-200 rounded-box py-16">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h2 className="text-2xl font-bold">No photos yet</h2>
            <p className="py-4 text-base-content/70">
              Belum ada foto yang diunggah. Jadilah yang pertama membagikan
              momen dari Padusan.
            </p>
            <a href="/upload" className="btn btn-primary">
              Upload Photo
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => openModal(photo)}
            className="card bg-base-100 shadow-md border border-base-300 text-left cursor-pointer hover:shadow-lg transition-shadow"
          >
            <figure className="aspect-square overflow-hidden bg-base-200">
              <img
                src={photo.image_url}
                alt={photo.caption || "Photo"}
                className="w-full h-full object-cover"
              />
            </figure>
            <div className="card-body">
              <p className="text-sm">{photo.caption || "No caption"}</p>
              <div className="card-actions flex flex-wrap gap-2 mt-2">
                {Array.isArray(photo.tags) &&
                  photo.tags.map((tag, idx) => (
                    <span key={idx} className="badge badge-outline badge-sm">
                      {tag}
                    </span>
                  ))}
              </div>
            </div>
          </button>
        ))}
      </div>

      {selectedPhoto && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <button
              type="button"
              onClick={closeModal}
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              aria-label="Close"
            >
              ✕
            </button>

            <div className="rounded-box overflow-hidden border border-base-300 mb-4 bg-base-200">
              <img
                src={selectedPhoto.image_url}
                alt={selectedPhoto.caption || "Photo"}
                className="w-full max-h-96 object-contain"
              />
            </div>

            {errorMessage && (
              <div role="alert" className="alert alert-error mb-4">
                <span>{errorMessage}</span>
              </div>
            )}

            {mode === "view" ? (
              <>
                <h3 className="font-bold text-lg mb-2">
                  {selectedPhoto.caption || "No caption"}
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {Array.isArray(selectedPhoto.tags) &&
                    selectedPhoto.tags.map((tag, idx) => (
                      <span key={idx} className="badge badge-outline">
                        {tag}
                      </span>
                    ))}
                </div>
                <p className="text-xs text-base-content/50 mb-4">
                  Diunggah pada{" "}
                  {new Date(selectedPhoto.created_at).toLocaleString("id-ID")}
                </p>
                <div className="modal-action">
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="btn btn-error btn-outline"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        Deleting...
                      </>
                    ) : (
                      "Delete"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={startEdit}
                    className="btn btn-primary"
                    disabled={isDeleting}
                  >
                    Edit
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="form-control mb-4">
                  <label className="label" htmlFor="edit-caption">
                    <span className="label-text">Caption</span>
                  </label>
                  <textarea
                    id="edit-caption"
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    className="textarea textarea-bordered w-full"
                    rows={3}
                    disabled={isSaving}
                  />
                </div>
                <div className="form-control mb-4">
                  <label className="label" htmlFor="edit-tags">
                    <span className="label-text">
                      Tags (separated by commas)
                    </span>
                  </label>
                  <input
                    id="edit-tags"
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="e.g. sunset, river, village"
                    className="input input-bordered w-full"
                    disabled={isSaving}
                  />
                </div>
                <div className="modal-action">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="btn btn-ghost"
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="btn btn-primary"
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="modal-backdrop" onClick={closeModal}></div>
        </dialog>
      )}
    </>
  );
}