import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, RefreshCw, Smartphone, ArrowLeft } from 'lucide-react';
import type { ExternalProject, ExternalVersion } from '@studio/core';
import { api, post, type Build, type Job, type Project } from './api';
import { useResource } from './hooks';
import { useSettings } from './main';
import { Empty, Loading, Modal, Notice, PackImage } from './components';

export function LauncherDashboard() {
  const builds = useResource<Build[]>('/launcher/builds'),
    catalog = useResource<{
      items: {
        id: string;
        name: string;
        icon: string | null;
        version: string;
        minecraft: string;
        modCount: number;
      }[];
    }>('/public/catalog');
  const settings = useSettings(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">UMA BIBLIOTECA NO SEU BOLSO</div>
        <h1>Launcher Pojav</h1>
        <p>
          Um aplicativo para todos os seus modpacks. Atualizações escolhidas por você, jogo
          disponível offline após a instalação.
        </p>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="panel">
        <h2>Aplicativo Android</h2>
        <p>
          Publicar uma release disponibiliza o modpack no catálogo do aplicativo. Você só precisa
          gerar outro APK quando alterar o próprio launcher.
        </p>
        <button
          className="primary"
          disabled={busy || !settings.buildEnabled}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const job = await post<Job>('/launcher/builds');
              navigate(`/imports/${job.id}`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Smartphone size={18} />
          Gerar APK do launcher
        </button>
        {!settings.buildEnabled && (
          <p className="muted">
            Configure o worker Android e a chave de assinatura para habilitar a geração.
          </p>
        )}
        {builds.error && <Notice>{builds.error}</Notice>}
        {builds.loading ? (
          <Loading />
        ) : (
          builds.data?.map((build) => (
            <div className="release-row" key={build.id}>
              <Link to={`/imports/${build.jobId}`}>
                Launcher {build.versionCode} · {build.status}
              </Link>
              {build.storageKey && (
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      const { url } = await api<{ url: string }>(`/builds/${build.id}/download`);
                      window.location.assign(url);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Download size={16} />
                  Baixar APK
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <div className="results-heading">
        <h2>Disponíveis no aplicativo</h2>
        <button className="secondary" onClick={catalog.reload}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      {catalog.error && <Notice>{catalog.error}</Notice>}
      {catalog.loading ? (
        <Loading />
      ) : catalog.data?.items.length ? (
        <div className="project-grid">
          {catalog.data.items.map((p) => (
            <Link key={p.id} className="project-card panel" to={`/projects/${p.id}`}>
              <PackImage src={p.icon} name={p.name} />
              <div>
                <h2>{p.name}</h2>
                <p>
                  Minecraft {p.minecraft} · {p.modCount} mods
                </p>
                <span className="status-pill">{p.version}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="Nenhum modpack publicado">
          Importe um modpack e publique uma release para disponibilizá-lo no launcher.
        </Empty>
      )}
    </>
  );
}

interface Diagnostic {
  id: string;
  kind: string;
  launcherVersion: string;
  device: { model: string; android: string; renderer?: string };
  message: string;
  log: string;
  status: string;
  createdAt: string;
}
export function DiagnosticsPage() {
  const [status, setStatus] = useState('new'),
    [selected, setSelected] = useState<Diagnostic | null>(null),
    [error, setError] = useState('');
  const reports = useResource<Diagnostic[]>(`/diagnostics?${status ? `status=${status}` : ''}`);
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">SUPORTE DO LAUNCHER</div>
        <h1>Relatórios de erro</h1>
        <p>
          Relatórios enviados pelos jogadores após consentimento. Tokens e dados pessoais são
          ocultados.
        </p>
      </div>
      <div className="filter-row">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="new">Novos</option>
            <option value="reviewed">Revisados</option>
            <option value="resolved">Resolvidos</option>
            <option value="">Todos</option>
          </select>
        </label>
        <button className="secondary" onClick={reports.reload}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      {(error || reports.error) && <Notice>{error || reports.error}</Notice>}
      {reports.loading ? (
        <Loading />
      ) : reports.data?.length ? (
        <div className="panel">
          {reports.data.map((r) => (
            <div className="release-row" key={r.id}>
              <div>
                <strong>{r.message}</strong>
                <p>
                  {r.device.model} · Android {r.device.android} ·{' '}
                  {new Date(r.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <button className="secondary" onClick={() => setSelected(r)}>
                Ver relatório
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Nenhum relatório nesta categoria" />
      )}
      {selected && (
        <Modal title="Relatório de erro" onClose={() => setSelected(null)}>
          <p>
            {selected.kind} · Launcher {selected.launcherVersion}
          </p>
          <p>{selected.message}</p>
          <pre className="diagnostic-log">{selected.log || 'Sem log anexado.'}</pre>
          <div className="form-actions">
            {['reviewed', 'resolved'].map((s) => (
              <button
                key={s}
                className="secondary"
                onClick={async () => {
                  try {
                    await api(`/diagnostics/${selected.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ status: s }),
                    });
                    setSelected(null);
                    reports.reload();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {s === 'reviewed' ? 'Marcar revisado' : 'Marcar resolvido'}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

interface Suggestions {
  items: {
    project: ExternalProject;
    version: ExternalVersion;
    purpose: string;
    warning: string | null;
    present: boolean;
    androidValidated: boolean;
  }[];
  optifine: { websiteUrl: string; warning: string };
}
export function PerformancePage() {
  const { id } = useParams();
  const suggestions = useResource<Suggestions>(`/projects/${id}/performance`),
    project = useResource<Project>(`/projects/${id}`);
  const [error, setError] = useState('');
  return (
    <>
      <Link className="back-link" to={`/projects/${id}`}>
        <ArrowLeft size={16} />
        Voltar ao projeto
      </Link>
      <div className="page-heading">
        <div className="eyebrow">VOCÊ ESCOLHE O QUE INSTALAR</div>
        <h1>Sugestões de desempenho</h1>
        <p>
          Opções compatíveis com a versão do Minecraft e o loader. A compatibilidade no Android
          depende do aparelho e do renderizador.
        </p>
      </div>
      {error && <Notice>{error}</Notice>}
      {project.data && (
        <div className="panel">
          <label className="check-label">
            <input
              type="checkbox"
              checked={project.data.draft.performance.enabled}
              onChange={async (e) => {
                try {
                  await api(`/projects/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      revision: project.data!.revision,
                      performanceEnabled: e.target.checked,
                    }),
                  });
                  project.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
            Sugerir configurações gráficas conservadoras na primeira instalação
          </label>
          <p className="muted">
            Distância de renderização 6, simulação 4 e limite de 60 FPS. Não instala mods.
          </p>
        </div>
      )}
      {suggestions.error && <Notice>{suggestions.error}</Notice>}
      {suggestions.loading ? (
        <Loading label="Buscando sugestões compatíveis..." />
      ) : (
        <div className="project-grid">
          {suggestions.data?.items.map((s) => (
            <div className="panel" key={s.project.externalProjectId}>
              <div className="project-card">
                <PackImage src={s.project.icon} name={s.project.name} />
                <h2>{s.project.name}</h2>
              </div>
              <p>{s.purpose}</p>
              <p className="muted">
                {s.version.name} ·{' '}
                {s.androidValidated
                  ? 'Validado no Android para este perfil'
                  : 'Requer teste no aparelho'}
              </p>
              {s.warning && <Notice>{s.warning}</Notice>}
              {s.present ? (
                <span className="status-pill">Já adicionado</span>
              ) : (
                <Link
                  className="button secondary"
                  to={`/catalog/modpacks/modrinth/${s.project.externalProjectId}?addTo=${id}`}
                >
                  Escolher versão e adicionar
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
      {suggestions.data && (
        <div className="panel">
          <h2>OptiFine</h2>
          <p>{suggestions.data.optifine.warning}</p>
          <a
            className="button secondary"
            href={suggestions.data.optifine.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir origem
          </a>
        </div>
      )}
    </>
  );
}
