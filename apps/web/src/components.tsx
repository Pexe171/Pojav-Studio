import { Download, Package, X, LoaderCircle, AlertCircle, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useRef, type ReactNode } from 'react';
import type { ExternalProject } from '@studio/core';
import { number, sourceName } from './api';
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="alert">
      <AlertCircle size={18} />
      <span>{children}</span>
    </div>
  );
}
export function Loading({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      {label}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <SearchX size={38} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Source({ provider }: { provider: string }) {
  return (
    <span className={`source source-${provider}`}>
      <span />
      {sourceName(provider)}
    </span>
  );
}
export function PackImage({
  src,
  name,
  large = false,
}: {
  src: string | null;
  name: string;
  large?: boolean;
}) {
  return src ? (
    <img
      className={`pack-icon ${large ? 'large' : ''}`}
      src={src}
      alt={`Ícone de ${name}`}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
      }}
    />
  ) : (
    <div className={`pack-icon placeholder ${large ? 'large' : ''}`}>
      <Package size={large ? 48 : 30} />
    </div>
  );
}
export function PackCard({ pack, addTo }: { pack: ExternalProject; addTo?: string }) {
  return (
    <article className="pack-card">
      <div className="card-top">
        <PackImage src={pack.icon} name={pack.name} />
        <Source provider={pack.provider} />
      </div>
      <h3>
        <Link
          to={
            pack.provider === 'local'
              ? `/projects/${pack.externalProjectId}`
              : `/catalog/modpacks/${pack.provider}/${pack.externalProjectId}${addTo ? `?addTo=${addTo}` : ''}`
          }
        >
          {pack.name}
        </Link>
      </h3>
      <p className="card-description">{pack.summary}</p>
      <div className="tags">
        <span>Minecraft {pack.minecraftVersions.at(-1) ?? '—'}</span>
        {pack.loaders.slice(0, 2).map((l) => (
          <span key={l} className="loader-tag">
            {l}
          </span>
        ))}
      </div>
      <div className="card-footer">
        <span>
          <Download size={14} />
          {number(pack.downloads)} downloads
        </span>
        <Link
          className="card-view"
          to={
            pack.provider === 'local'
              ? `/projects/${pack.externalProjectId}`
              : `/catalog/modpacks/${pack.provider}/${pack.externalProjectId}${addTo ? `?addTo=${addTo}` : ''}`
          }
        >
          Ver
        </Link>
      </div>
    </article>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
