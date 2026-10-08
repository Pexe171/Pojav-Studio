import { useEffect, useState } from 'react';
import type { Project } from './api';
import { useResource } from './hooks';
import { Loading, Notice } from './components';
interface Event {
  id: string;
  deviceKey: string;
  sessionId: string;
  projectId: string | null;
  releaseId: string | null;
  kind: string;
  launcherVersion: string;
  occurredAt: string;
  receivedAt: string;
  device: { model: string; android: string; architecture: string };
  data: { durationMs?: number; exitCode?: number; message?: string; performanceMode?: string };
  log: string;
}
interface Page {
  events: Event[];
  total: number;
  devices: { deviceKey: string; events: number }[];
  nextOffset: number | null;
}
const labels: Record<string, string> = {
  'telemetry-enabled': 'Envio automático ativado',
  'installation-start': 'Instalação iniciada',
  'installation-ready': 'Instalação concluída',
  'installation-pending': 'Instalação pendente',
  'installation-failed': 'Falha de instalação',
  'launch-request': 'Jogo solicitado',
  'game-start': 'Execução iniciada',
  'game-exit': 'Execução encerrada',
  'game-log': 'Log de execução',
  'session-interrupted': 'Saída não registrada',
};
export function TelemetryPage() {
  const [projectId, setProjectId] = useState(''),
    [deviceKey, setDeviceKey] = useState(''),
    [kind, setKind] = useState(''),
    [offset, setOffset] = useState(0);
  const query = new URLSearchParams({
    offset: String(offset),
    ...(projectId ? { projectId } : {}),
    ...(deviceKey ? { deviceKey } : {}),
    ...(kind ? { kind } : {}),
  });
  const events = useResource<Page>(`/telemetry?${query}`),
    projects = useResource<Project[]>('/projects');
  useEffect(() => {
    const timer = setInterval(events.reload, 30000);
    return () => clearInterval(timer);
  }, [events.reload]);
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">DIAGNÓSTICO DOS APARELHOS</div>
        <h1>Telemetria</h1>
        <p>
          Logs e eventos enviados com consentimento, por aparelho, modpack, release e sessão.
          Eventos offline mostram a hora de ocorrência e de recebimento.
        </p>
      </div>
      <div className="panel">
        <div className="form-row">
          <label>
            Modpack
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setDeviceKey('');
                setOffset(0);
              }}
            >
              <option value="">Todos</option>
              {projects.data?.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Aparelho
            <select
              value={deviceKey}
              onChange={(e) => {
                setDeviceKey(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todos</option>
              {events.data?.devices.map((d) => (
                <option key={d.deviceKey} value={d.deviceKey}>
                  {d.deviceKey.slice(0, 10)} · {d.events} eventos
                </option>
              ))}
            </select>
          </label>
          <label>
            Evento
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(labels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          {events.data?.total ?? 0} eventos neste filtro. O código do aparelho é pseudônimo; não é
          IMEI. “Saída não registrada” pode significar fechamento manual ou encerramento pelo
          Android, sem comprovar crash.
        </p>
        <button className="secondary" onClick={events.reload}>
          Atualizar
        </button>
      </div>
      {events.error && <Notice>{events.error}</Notice>}
      {events.loading && !events.data ? (
        <Loading />
      ) : events.data?.events.length ? (
        events.data.events.map((e) => (
          <details className="panel" key={e.id} style={{ marginTop: 12, minWidth: 0 }}>
            <summary style={{ cursor: 'pointer', overflowWrap: 'anywhere' }}>
              <strong>{labels[e.kind] ?? e.kind}</strong> · {e.device.model} ·{' '}
              {projects.data?.find((p) => p.id === e.projectId)?.name ?? 'Launcher'} ·{' '}
              {new Date(e.occurredAt).toLocaleString('pt-BR')}
            </summary>
            <p className="muted" style={{ overflowWrap: 'anywhere' }}>
              Aparelho {e.deviceKey.slice(0, 10)} · Android {e.device.android} ·{' '}
              {e.device.architecture} · APK {e.launcherVersion}
              <br />
              Sessão: {e.sessionId}
              <br />
              Release: {e.releaseId ?? '—'}
              <br />
              Recebido: {new Date(e.receivedAt).toLocaleString('pt-BR')}
            </p>
            {e.data.durationMs !== undefined && (
              <p>Duração: {(e.data.durationMs / 1000).toFixed(1)} s</p>
            )}
            {e.data.exitCode !== undefined && <p>Código de saída: {e.data.exitCode}</p>}
            {e.data.performanceMode && <p>Perfil de desempenho: {e.data.performanceMode}</p>}
            {e.data.message && <p style={{ overflowWrap: 'anywhere' }}>{e.data.message}</p>}
            {e.log && (
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  fontSize: 12,
                  maxHeight: 500,
                  overflow: 'auto',
                }}
              >
                {e.log}
              </pre>
            )}
          </details>
        ))
      ) : (
        <div className="panel" style={{ marginTop: 12 }}>
          Nenhum evento recebido. O usuário precisa aceitar “Relatórios automáticos” no aplicativo.
        </div>
      )}
      <div className="pagination" style={{ marginTop: 16 }}>
        <button
          className="secondary"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 25))}
        >
          Anterior
        </button>
        <span>Página {Math.floor(offset / 25) + 1}</span>
        <button
          className="secondary"
          disabled={events.data?.nextOffset == null}
          onClick={() => setOffset(events.data!.nextOffset!)}
        >
          Próxima
        </button>
      </div>
    </>
  );
}
