import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  Upload,
  SlidersHorizontal,
  Download,
  ExternalLink,
  ArrowLeft,
  Plus,
  Check,
  Package,
  Clock,
  RefreshCw,
  Trash2,
  Save,
  Smartphone,
  GitFork,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  AlertCircle,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type {
  Category,
  ExternalProject,
  ExternalVersion,
  FileChange,
  MergeConflict,
  ResolvedFile,
} from '@studio/core';
import { api, post, bytes, number, sourceName, type Project, type Job } from './api';
import { useResource, useJob } from './hooks';
import { Empty, Loading, Modal, Notice, PackCard, PackImage, Source } from './components';
import { useSettings } from './main';
interface CatalogPage {
  items: ExternalProject[];
  total: number;
  nextCursor: string | null;
  issues: { provider: string; message: string }[];
}
function UploadPack() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <label className={`button secondary ${busy ? 'disabled' : ''}`}>
        <Upload size={17} />
        {busy ? 'Enviando...' : 'Importar arquivo'}
        <input
          type="file"
          accept=".mrpack,.zip,.json"
          disabled={busy}
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError('');
            try {
              const form = new FormData();
              form.append('file', file);
              const job = await api<Job>('/imports/upload', { method: 'POST', body: form });
              navigate(`/imports/${job.id}`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {error && <Notice>{error}</Notice>}
    </>
  );
}
export function Catalog() {
  const [params, setParams] = useSearchParams();
  const addTo = params.get('addTo') ?? undefined;
  const [source, setSource] = useState(params.get('provider') ?? 'all'),
    [query, setQuery] = useState(params.get('query') ?? ''),
    [search, setSearch] = useState(query),
    [minecraft, setMinecraft] = useState(''),
    [loader, setLoader] = useState(''),
    [category, setCategory] = useState(''),
    [sort, setSort] = useState('popular'),
    [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState<(string | null)[]>([]);
  const categories = useResource<{ items: Category[] }>('/catalog/categories');
  const target = useResource<Project>(addTo ? `/projects/${addTo}` : null);
  const settings = useSettings();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setCursor(null);
    setHistory([]);
  }, [source, search, minecraft, loader, category, sort]);
  useEffect(() => {
    if (target.data) {
      setMinecraft(target.data.draft.minecraft);
      setLoader(target.data.draft.loader.type);
    }
  }, [target.data]);
  const filters = new URLSearchParams({
    provider: source,
    query: search,
    sort,
    type: addTo ? 'mod' : 'modpack',
    limit: '24',
  });
  if (minecraft) filters.set('minecraft', minecraft);
  if (loader) filters.set('loader', loader);
  if (category) filters.set('category', category);
  if (cursor) filters.set('cursor', cursor);
  const catalog = useResource<CatalogPage>(`/catalog/modpacks?${filters}`);
  const tabs = [
    ['all', 'Todos'],
    ['curseforge', 'CurseForge'],
    ['modrinth', 'Modrinth'],
    ...(!addTo ? [['local', 'Meus Modpacks']] : []),
  ];
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">DESCUBRA SUA PRÓXIMA AVENTURA</div>
        <div className="heading-row">
          <div>
            <h1>{addTo ? 'Adicionar mods' : 'Explorar Modpacks'}</h1>
            <p>
              {addTo
                ? `Escolha um mod compatível para ${target.data?.name ?? 'seu projeto'}.`
                : 'Encontre um mundo novo. Transforme em algo seu.'}
            </p>
          </div>
          {!addTo && <UploadPack />}
        </div>
      </div>
      {addTo && (
        <Link className="back-link" to={`/projects/${addTo}`}>
          <ArrowLeft size={16} />
          Voltar ao projeto
        </Link>
      )}
      <div className="catalog-tabs" role="tablist" aria-label="Origem do catálogo">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={source === id}
            className={source === id ? 'active' : ''}
            onClick={() => {
              setSource(id!);
              setCategory('');
              setParams(addTo ? { addTo, provider: id! } : { provider: id! });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="filter-panel">
        <div className="search-field">
          <Search size={20} />
          <input
            aria-label={addTo ? 'Pesquisar mods' : 'Pesquisar modpacks'}
            placeholder={addTo ? 'Pesquisar mods...' : 'Pesquisar modpacks, como Cobblemon...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌕</kbd>
        </div>
        <div className="filter-row">
          <SlidersHorizontal size={17} />
          <label>
            Minecraft
            <input
              placeholder="Todas as versões"
              aria-label="Minecraft"
              list="mc-versions"
              value={minecraft}
              onChange={(e) => setMinecraft(e.target.value)}
            />
            <datalist id="mc-versions">
              {['1.21.1', '1.21', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2'].map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
          <label>
            Loader
            <select value={loader} onChange={(e) => setLoader(e.target.value)}>
              <option value="">Todos</option>
              {['fabric', 'forge', 'neoforge', 'quilt'].map((l) => (
                <option key={l} value={l}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Categoria
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas</option>
              {categories.data?.items
                .filter((c) => source === 'all' || c.provider === source)
                .map((c) => (
                  <option key={`${c.provider}:${c.id}`} value={`${c.provider}:${c.id}`}>
                    {c.name} · {sourceName(c.provider)}
                  </option>
                ))}
            </select>
          </label>
          <label className="sort-filter">
            Ordenar
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="popular">Popularidade</option>
              <option value="updated">Atualização recente</option>
              <option value="newest">Mais recentes</option>
              <option value="relevance">Relevância</option>
            </select>
          </label>
        </div>
      </div>
      {source === 'curseforge' && !settings.curseforgeConfigured && (
        <Notice>
          CurseForge ainda não configurado. Peça ao administrador para configurar a chave de acesso.
        </Notice>
      )}
      {catalog.error && (
        <Notice>
          {catalog.error}
          <button className="text-button" onClick={catalog.reload}>
            Tentar novamente
          </button>
        </Notice>
      )}
      {catalog.data?.issues.map((issue) => (
        <Notice key={issue.provider}>
          {sourceName(issue.provider)}: {issue.message}
        </Notice>
      ))}
      <div className="results-heading">
        <h2>{search ? `Resultados para “${search}”` : 'Modpacks para explorar'}</h2>
        <span>
          {catalog.loading ? 'Buscando...' : `${catalog.data?.items.length ?? 0} nesta página`}
        </span>
      </div>
      {catalog.loading ? (
        <div className="card-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="pack-card skeleton" />
          ))}
        </div>
      ) : catalog.data?.items.length ? (
        <div className="card-grid">
          {catalog.data.items.map((pack) => (
            <PackCard
              key={`${pack.provider}:${pack.externalProjectId}`}
              pack={pack}
              addTo={addTo}
            />
          ))}
        </div>
      ) : (
        <Empty title="Nenhum resultado encontrado">
          Experimente outro nome ou ajuste os filtros.
        </Empty>
      )}
      <div className="pagination">
        <span>Catálogos independentes · ordenação dos resultados consultados</span>
        <div>
          <button
            className="secondary"
            disabled={!history.length || catalog.loading}
            onClick={() => {
              setCursor(history.at(-1) ?? null);
              setHistory((h) => h.slice(0, -1));
            }}
          >
            <ChevronLeft size={16} />
            Anterior
          </button>
          <span>{history.length + 1}</span>
          <button
            className="secondary"
            disabled={!catalog.data?.nextCursor || catalog.loading}
            onClick={() => {
              setHistory((h) => [...h, cursor]);
              setCursor(catalog.data!.nextCursor);
            }}
          >
            Próxima
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
export function Details() {
  const { provider, id } = useParams();
  const [params] = useSearchParams();
  const addTo = params.get('addTo');
  const navigate = useNavigate();
  const detail = useResource<ExternalProject>(`/catalog/modpacks/${provider}/${id}`);
  const target = useResource<Project>(addTo ? `/projects/${addTo}` : null);
  const versionFilters = target.data
    ? `?minecraft=${target.data.draft.minecraft}&loader=${target.data.draft.loader.type}`
    : '';
  const versions = useResource<ExternalVersion[]>(
    `/catalog/modpacks/${provider}/${id}/versions${versionFilters}`,
  );
  const [selected, setSelected] = useState(''),
    [showModal, setShowModal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setSelected(versions.data?.[0]?.id ?? '');
  }, [versions.data]);
  if (detail.loading) return <Loading />;
  if (detail.error || !detail.data)
    return <Notice>{detail.error || 'Modpack não encontrado'}</Notice>;
  const pack = detail.data,
    v = versions.data?.find((v) => v.id === selected);
  const html = DOMPurify.sanitize(
    pack.descriptionFormat === 'markdown'
      ? marked.parse(pack.description, { async: false })
      : pack.descriptionFormat === 'html'
        ? pack.description
        : '',
    { FORBID_TAGS: ['img', 'iframe', 'style'], FORBID_ATTR: ['style'] },
  );
  const importPack = async () => {
    setBusy(true);
    setError('');
    try {
      const job = await post<Job>('/imports', {
        provider,
        projectId: id,
        versionId: selected,
        operation: addTo ? 'add-mod' : 'prepare',
        ...(addTo ? { targetProjectId: addTo, revision: target.data?.revision } : {}),
      });
      navigate(`/imports/${job.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link className="back-link" to={`/catalog/modpacks${addTo ? `?addTo=${addTo}` : ''}`}>
        <ArrowLeft size={16} />
        Voltar ao catálogo
      </Link>
      <div
        className="detail-banner"
        style={
          pack.gallery[0]
            ? {
                backgroundImage: `linear-gradient(0deg, #171921 0%, transparent 100%), url(${JSON.stringify(pack.gallery[0])})`,
              }
            : undefined
        }
      >
        <span className="banner-label">
          {sourceName(pack.provider)} / {addTo ? 'MOD' : 'MODPACK'}
        </span>
      </div>
      <div className="detail-heading">
        <PackImage src={pack.icon} name={pack.name} large />
        <div>
          <Source provider={pack.provider} />
          <h1>{pack.name}</h1>
          <p>por {pack.authors.join(', ')}</p>
        </div>
        <a
          className="secondary button"
          href={pack.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={17} />
          Abrir na origem
        </a>
      </div>
      <p className="detail-summary">{pack.summary}</p>
      <div className="detail-layout">
        <section className="panel description">
          <h2>Sobre {addTo ? 'o mod' : 'o modpack'}</h2>
          {pack.descriptionFormat === 'text' ? (
            <p>{pack.description}</p>
          ) : (
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          )}
          {!!pack.gallery.length && (
            <>
              <h2>Galeria</h2>
              <div className="gallery">
                {pack.gallery.map((src) => (
                  <a href={src} key={src} target="_blank" rel="noopener noreferrer">
                    <img src={src} alt={`Screenshot de ${pack.name}`} loading="lazy" />
                  </a>
                ))}
              </div>
            </>
          )}
        </section>
        <aside className="detail-side">
          <div className="panel">
            <h2>Escolha uma versão</h2>
            {versions.error && <Notice>{versions.error}</Notice>}
            {versions.loading ? (
              <Loading label="Buscando versões..." />
            ) : (
              <label>
                Versão
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {versions.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {v && (
              <dl className="facts">
                <div>
                  <dt>Minecraft</dt>
                  <dd>{v.minecraftVersions.join(', ') || 'A analisar'}</dd>
                </div>
                <div>
                  <dt>Loader</dt>
                  <dd>{v.loaders.join(', ') || 'A analisar'}</dd>
                </div>
                <div>
                  <dt>Arquivo</dt>
                  <dd>{v.files[0]?.filename ?? '—'}</dd>
                </div>
                <div>
                  <dt>Tamanho do pacote</dt>
                  <dd>{bytes(v.files.reduce((n, f) => n + f.size, 0))}</dd>
                </div>
              </dl>
            )}
            <button
              className="primary full"
              disabled={!v || busy || (!!addTo && !target.data)}
              onClick={() => setShowModal(true)}
            >
              <Download size={18} />
              {addTo ? 'Adicionar mod' : 'Importar modpack'}
            </button>
          </div>
          <div className="panel">
            <h2>Informações</h2>
            <dl className="facts">
              <div>
                <dt>Downloads</dt>
                <dd>{number(pack.downloads)}</dd>
              </div>
              {pack.followers !== null && (
                <div>
                  <dt>Seguidores</dt>
                  <dd>{number(pack.followers)}</dd>
                </div>
              )}
              <div>
                <dt>Atualizado</dt>
                <dd>{new Date(pack.updatedAt).toLocaleDateString('pt-BR')}</dd>
              </div>
              <div>
                <dt>Licença</dt>
                <dd>{pack.license ?? 'Consulte a origem'}</dd>
              </div>
            </dl>
            <div className="tags">
              {pack.categories.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
        </aside>
      </div>
      {showModal && v && (
        <Modal
          title={addTo ? 'Adicionar mod' : 'Importar modpack'}
          onClose={() => setShowModal(false)}
        >
          <h3>{pack.name}</h3>
          <p>{v.name}</p>
          <dl className="facts">
            <div>
              <dt>Minecraft</dt>
              <dd>{v.minecraftVersions.join(', ') || 'A analisar'}</dd>
            </div>
            <div>
              <dt>Loader</dt>
              <dd>{v.loaders.join(', ') || 'A analisar'}</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>{sourceName(pack.provider)}</dd>
            </div>
            <div>
              <dt>Mods e tamanho instalado</dt>
              <dd>Calculados durante a análise</dd>
            </div>
          </dl>
          <p className="muted">
            Vamos analisar o pacote e verificar os arquivos antes de criar seu projeto.
          </p>
          {error && <Notice>{error}</Notice>}
          <button className="primary full" disabled={busy} onClick={() => void importPack()}>
            {busy ? 'Preparando...' : 'Analisar e importar'}
          </button>
        </Modal>
      )}
    </>
  );
}
export function ImportReview() {
  const { id } = useParams();
  const { job, error } = useJob(id);
  const navigate = useNavigate();
  const [name, setName] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  useEffect(() => {
    if (job?.result?.bundle && !name) setName(job.result.bundle.name);
  }, [job?.result?.bundle?.name]);
  if (!job) return error ? <Notice>{error}</Notice> : <Loading label="Abrindo importação..." />;
  const bundle = job.result?.bundle,
    ready = job.status === 'ready',
    terminal = ['ready', 'committed', 'failed', 'cancelled'].includes(job.status),
    progress = job.progress;
  const finish = async () => {
    setBusy(true);
    setActionError('');
    try {
      if (job.kind === 'prepare') {
        const project = await post<Project>(`/jobs/${id}/commit`, {
          name,
          optionalFiles: selected,
        });
        navigate(`/projects/${project.id}`);
      } else if (job.kind === 'upstream') {
        navigate(`/projects/${job.projectId}?diffJob=${id}`);
      } else if (job.kind === 'add-mod' || job.kind === 'verify-draft') {
        await post(`/projects/${job.projectId}/apply-job`, { jobId: id });
        navigate(`/projects/${job.projectId}`);
      }
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link
        className="back-link"
        to={job.projectId ? `/projects/${job.projectId}` : '/catalog/modpacks'}
      >
        <ArrowLeft size={16} />
        Voltar
      </Link>
      <div className="page-heading">
        <div className="eyebrow">{job.kind === 'build' ? 'BUILD ANDROID' : 'IMPORTAÇÃO'}</div>
        <h1>
          {job.kind === 'build'
            ? 'Gerando seu APK'
            : ready
              ? 'Pronto para importar'
              : 'Analisando modpack'}
        </h1>
        <p>{progress.message}</p>
      </div>
      {(error || job.error) && <Notice>{error || job.error}</Notice>}
      <div className="panel import-progress">
        <div className="progress-heading">
          <FileArchive size={25} />
          <div>
            <h2>{bundle?.name ?? 'Preparando arquivos'}</h2>
            <span>{sourceName(job.result?.importedFrom?.provider ?? 'local')}</span>
          </div>
          <span className="status-pill">
            {job.status === 'ready'
              ? 'Analisado'
              : job.status === 'failed'
                ? 'Falhou'
                : job.status === 'cancelled'
                  ? 'Cancelado'
                  : job.status === 'committed'
                    ? 'Importado'
                    : 'Processando'}
          </span>
        </div>
        <progress
          max={Math.max(progress.total, 1)}
          value={ready ? Math.max(progress.total, 1) : progress.completed}
        />
        <div className="stage-grid">
          {[
            ['Minecraft', bundle?.minecraft],
            ['Loader', bundle ? `${bundle.loader.type} ${bundle.loader.version}` : null],
            [
              'Mods',
              bundle
                ? `${bundle.files.filter((f) => f.kind === 'mod' && f.status === 'resolved').length}/${bundle.files.filter((f) => f.kind === 'mod').length}`
                : null,
            ],
            [
              'Dependências',
              ready
                ? 'Analisadas'
                : progress.stage === 'dependencies'
                  ? `${progress.completed}/${progress.total}`
                  : null,
            ],
            [
              'Configs',
              bundle ? `${bundle.files.filter((f) => f.kind === 'config').length} arquivos` : null,
            ],
            [
              'Resource packs',
              bundle
                ? `${bundle.files.filter((f) => f.kind === 'resourcepack').length} arquivos`
                : null,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value ?? 'Aguardando'}</strong>
              {value &&
                (['Minecraft', 'Loader'].includes(label!) ||
                (ready && bundle?.files.every((f) => !f.required || f.status === 'resolved')) ? (
                  <Check size={17} />
                ) : (
                  <Clock size={17} />
                ))}
            </div>
          ))}
        </div>
        {!terminal && (
          <button className="secondary" onClick={() => void post(`/jobs/${id}/cancel`)}>
            Cancelar
          </button>
        )}
      </div>
      {ready && bundle && (
        <div className="panel import-review">
          <h2>
            {job.kind === 'prepare'
              ? 'Importar modpack'
              : job.kind === 'upstream'
                ? 'Analisar alterações'
                : 'Aplicar ao projeto'}
          </h2>
          {job.kind === 'prepare' && (
            <label>
              Nome do projeto
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
          )}
          <dl className="facts">
            <div>
              <dt>Minecraft</dt>
              <dd>{bundle.minecraft}</dd>
            </div>
            <div>
              <dt>Loader</dt>
              <dd>
                {bundle.loader.type} {bundle.loader.version}
              </dd>
            </div>
            <div>
              <dt>Mods</dt>
              <dd>{bundle.files.filter((f) => f.kind === 'mod').length}</dd>
            </div>
            <div>
              <dt>Tamanho estimado</dt>
              <dd>
                {bytes(
                  bundle.files
                    .filter((f) => f.required || selected.includes(f.id))
                    .reduce((n, f) => n + f.size, 0),
                )}
              </dd>
            </div>
          </dl>
          {job.kind === 'prepare' &&
            bundle.files.filter((f) => !f.required && !f.requiredBy.length).length > 0 && (
              <div>
                <h3>Arquivos opcionais</h3>
                {bundle.files
                  .filter((f) => !f.required && !f.requiredBy.length)
                  .map((f) => (
                    <label className="check-label" key={f.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(f.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked ? [...s, f.id] : s.filter((id) => id !== f.id),
                          )
                        }
                      />
                      {f.name}
                    </label>
                  ))}
              </div>
            )}
          {bundle.files
            .filter((f) => f.status !== 'resolved' && f.required)
            .map((f) => (
              <Notice key={f.id}>
                {f.name}: {f.issue ?? 'Arquivo pendente'}
              </Notice>
            ))}
          {!!bundle.warnings.length && (
            <details>
              <summary>Avisos da análise ({bundle.warnings.length})</summary>
              {bundle.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </details>
          )}
          {actionError && <Notice>{actionError}</Notice>}
          <p className="muted">
            Arquivos pendentes podem ser ajustados no projeto antes da publicação.
          </p>
          <button
            className="primary full"
            disabled={busy || !name.trim()}
            onClick={() => void finish()}
          >
            {busy
              ? 'Salvando...'
              : job.kind === 'upstream'
                ? 'Ver alterações'
                : job.kind === 'prepare'
                  ? 'Importar'
                  : 'Aplicar ao projeto'}
          </button>
        </div>
      )}
      {job.kind === 'build' && ready && job.result?.buildId && (
        <button
          className="primary"
          onClick={async () => {
            const { url } = await api<{ url: string }>(`/builds/${job.result!.buildId}/download`);
            window.location.assign(url);
          }}
        >
          <Download size={18} />
          Baixar APK
        </button>
      )}
      {job.status === 'committed' && job.projectId && (
        <Link className="button primary" to={`/projects/${job.projectId}`}>
          Abrir projeto
        </Link>
      )}
    </>
  );
}
export function Projects() {
  const projects = useResource<Project[]>('/projects');
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">SEU WORKSPACE</div>
        <div className="heading-row">
          <div>
            <h1>Meus Modpacks</h1>
            <p>Importe, personalize e publique sua próxima versão.</p>
          </div>
          <UploadPack />
        </div>
      </div>
      {projects.error && <Notice>{projects.error}</Notice>}
      {projects.loading ? (
        <Loading />
      ) : projects.data?.length ? (
        <div className="project-grid">
          {projects.data.map((p) => (
            <Link className="project-card panel" key={p.id} to={`/projects/${p.id}`}>
              <PackImage src={p.icon} name={p.name} />
              <div>
                <h2>{p.name}</h2>
                <p>
                  {p.draft.minecraft} · {p.draft.loader.type} ·{' '}
                  {p.draft.files.filter((f) => f.kind === 'mod').length} mods
                </p>
                <span className="muted">{p.customVersion}</span>
              </div>
              <span className="status-pill">{p.modified ? 'Personalizado' : 'Rascunho'}</span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="Sua biblioteca começa aqui">
          Explore o catálogo ou importe um arquivo para criar seu primeiro modpack.
          <Link className="button primary" to="/catalog/modpacks">
            <CompassIcon />
            Explorar modpacks
          </Link>
        </Empty>
      )}
    </>
  );
}
const CompassIcon = () => <Search size={16} />;
interface UpstreamCheck {
  installed: ExternalVersion;
  newest: ExternalVersion | null;
  versions: ExternalVersion[];
}
interface Diff {
  files: ResolvedFile[];
  conflicts: MergeConflict[];
  changes: FileChange[];
  installed: string;
  newVersion: string;
  jobId: string;
  revision: number;
}
export function ProjectEditor() {
  const { id } = useParams(),
    navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const project = useResource<Project>(`/projects/${id}`);
  const [name, setName] = useState(''),
    [version, setVersion] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('mod'),
    [publishOpen, setPublishOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [upstream, setUpstream] = useState<UpstreamCheck | null>(null),
    [choices, setChoices] = useState<Record<string, 'local' | 'upstream'>>({}),
    [deleteFile, setDeleteFile] = useState<ResolvedFile | null>(null);
  const diffJob = params.get('diffJob');
  const diff = useResource<Diff>(diffJob ? `/projects/${id}/upstream/diff/${diffJob}` : null);
  useEffect(() => {
    if (project.data) {
      setName(project.data.name);
      setVersion(project.data.customVersion);
    }
  }, [project.data]);
  const run = async (action: () => Promise<unknown>, reload = true) => {
    setBusy(true);
    setError('');
    try {
      await action();
      if (reload) project.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (project.loading && !project.data) return <Loading />;
  if (project.error || !project.data)
    return <Notice>{project.error || 'Projeto não encontrado'}</Notice>;
  const p = project.data,
    b = p.draft;
  const pending = b.files.filter((f) => f.required && f.status !== 'resolved');
  return (
    <>
      <Link className="back-link" to="/projects">
        <ArrowLeft size={16} />
        Meus Modpacks
      </Link>
      <div className="editor-heading">
        <PackImage src={p.icon} name={p.name} large />
        <div>
          <div className="eyebrow">SEU MODPACK</div>
          <h1>{p.name}</h1>
          <p>
            Minecraft {b.minecraft} · {b.loader.type} {b.loader.version}
          </p>
        </div>
        <button
          className="primary"
          disabled={busy || pending.length > 0}
          onClick={() => {
            setConfirmed(false);
            setPublishOpen(true);
          }}
        >
          <Upload size={17} />
          Publicar release
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      {p.modified && (
        <div className="fork-note">
          <GitFork size={21} />
          <div>
            <strong>Este projeto foi modificado em relação ao modpack original.</strong>
            <p>
              Upstream: {p.importedFrom?.name} · Nossa versão: {p.customVersion}
            </p>
          </div>
        </div>
      )}
      <div className="editor-layout">
        <section>
          <form
            className="panel identity-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                api(`/projects/${id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ revision: p.revision, name, customVersion: version }),
                }),
              );
            }}
          >
            <h2>Identidade do projeto</h2>
            <div className="form-row">
              <label>
                Nome
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Nossa versão
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  maxLength={100}
                  required
                />
              </label>
            </div>
            <div className="form-actions">
              <label className="button secondary">
                <Upload size={16} />
                Alterar logo
                <input
                  hidden
                  type="file"
                  accept="image/png"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void run(() => {
                        const form = new FormData();
                        form.append('file', file);
                        form.append('revision', String(p.revision));
                        return api(`/projects/${id}/icon`, { method: 'POST', body: form });
                      });
                  }}
                />
              </label>
              <button className="secondary" disabled={busy}>
                <Save size={16} />
                Salvar
              </button>
            </div>
          </form>
          <div className="panel file-panel">
            <div className="section-heading">
              <h2>
                Arquivos do modpack <span>{b.files.length}</span>
              </h2>
              <Link className="button secondary" to={`/catalog/modpacks?addTo=${id}`}>
                <Plus size={16} />
                Adicionar mod
              </Link>
            </div>
            <div className="file-tabs">
              {[
                ['mod', 'Mods'],
                ['config', 'Configs'],
                ['resourcepack', 'Resource packs'],
                ['shaderpack', 'Shaders'],
                ['other', 'Outros'],
              ].map(([kind, label]) => (
                <button
                  className={tab === kind ? 'active' : ''}
                  key={kind}
                  onClick={() => setTab(kind!)}
                >
                  {label}
                  <span>{b.files.filter((f) => f.kind === kind).length}</span>
                </button>
              ))}
            </div>
            {b.files.filter((f) => f.kind === tab).length ? (
              <div className="file-list">
                {b.files
                  .filter((f) => f.kind === tab)
                  .map((file) => (
                    <div className="file-row" key={file.id}>
                      <div className="file-glyph">
                        <Package size={18} />
                      </div>
                      <div className="file-info">
                        <strong>{file.name}</strong>
                        <span>
                          Fonte: {sourceName(file.provider)} · {file.filename}
                        </span>
                        {file.issue && <small className="file-issue">{file.issue}</small>}
                      </div>
                      <span className={`file-status ${file.status}`}>
                        {file.status === 'resolved'
                          ? 'Verificado'
                          : file.status === 'conflict'
                            ? 'Conflito'
                            : 'Pendente'}
                      </span>
                      <span className="file-size">{bytes(file.size)}</span>
                      <button
                        className="icon-button"
                        aria-label={`Remover ${file.name}`}
                        disabled={busy}
                        onClick={() => setDeleteFile(file)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <Empty title="Nenhum arquivo nesta categoria" />
            )}
            <div className="file-toolbar">
              <label className="button secondary">
                <Upload size={16} />
                Adicionar arquivo local
                <input
                  hidden
                  type="file"
                  accept=".jar,.json,.toml,.cfg,.zip,.txt,.properties"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const folder =
                      tab === 'mod'
                        ? 'mods'
                        : tab === 'resourcepack'
                          ? 'resourcepacks'
                          : tab === 'shaderpack'
                            ? 'shaderpacks'
                            : tab === 'config'
                              ? 'config'
                              : '';
                    void run(() => {
                      const form = new FormData();
                      form.append('file', file);
                      form.append('revision', String(p.revision));
                      form.append('path', `${folder ? `${folder}/` : ''}${file.name}`);
                      return api(`/projects/${id}/files`, { method: 'POST', body: form });
                    });
                  }}
                />
              </label>
              <a href={`/api/v1/projects/${id}/export`} className="button text-button">
                <Download size={16} />
                Exportar manifest
              </a>
            </div>
          </div>
        </section>
        <aside className="detail-side">
          <div className="panel">
            <h2>Pronto para Android</h2>
            <Link className="button secondary full" to={`/projects/${id}/performance`}>
              Sugestões de desempenho
            </Link>
            <dl className="facts">
              <div>
                <dt>Arquivos verificados</dt>
                <dd>
                  {b.files.filter((f) => f.status === 'resolved').length}/{b.files.length}
                </dd>
              </div>
              <div>
                <dt>Tamanho estimado</dt>
                <dd>{bytes(b.files.reduce((n, f) => n + f.size, 0))}</dd>
              </div>
              <div>
                <dt>Pendências</dt>
                <dd>{pending.length}</dd>
              </div>
            </dl>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const job = await post<Job>(`/projects/${id}/verify`);
                  navigate(`/imports/${job.id}`);
                }, false)
              }
            >
              <RefreshCw size={16} />
              Verificar arquivos
            </button>
          </div>
          {p.importedFrom && (
            <div className="panel">
              <h2>Modpack original</h2>
              <Source provider={p.importedFrom.provider} />
              <h3>{p.importedFrom.name}</h3>
              <p className="muted">Versão instalada: {p.upstreamSnapshot?.version}</p>
              <button
                className="secondary full"
                disabled={busy}
                onClick={() =>
                  void run(
                    async () => setUpstream(await api<UpstreamCheck>(`/projects/${id}/upstream`)),
                    false,
                  )
                }
              >
                <RefreshCw size={16} />
                Verificar nova versão
              </button>
              {upstream &&
                (upstream.newest ? (
                  <div className="upstream-result">
                    <strong>Nova versão: {upstream.newest.name}</strong>
                    <button
                      className="primary full"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const job = await post<Job>(`/projects/${id}/upstream/prepare`, {
                            versionId: upstream.newest!.id,
                          });
                          navigate(`/imports/${job.id}`);
                        }, false)
                      }
                    >
                      Ver alterações
                    </button>
                  </div>
                ) : (
                  <p className="muted">Você está na versão mais recente compatível.</p>
                ))}
            </div>
          )}
          <div className="panel">
            <h2>Releases</h2>
            {p.releases?.length ? (
              p.releases.map((r) => (
                <div className="release-row" key={r.id}>
                  <div>
                    <strong>{r.version}</strong>
                    <small>{new Date(r.createdAt).toLocaleDateString('pt-BR')}</small>
                  </div>
                  <span className="status-pill">No catálogo Android</span>
                </div>
              ))
            ) : (
              <p className="muted">Nenhuma release publicada.</p>
            )}
            <Link className="button secondary full" to="/launcher">
              <Smartphone size={16} />
              Abrir launcher Android
            </Link>
          </div>
        </aside>
      </div>
      {deleteFile && (
        <Modal title="Remover arquivo" onClose={() => setDeleteFile(null)}>
          <p>Remover {deleteFile.name} deste projeto?</p>
          <p className="muted">
            Você precisará verificar novamente as dependências antes de publicar.
          </p>
          <button
            className="danger full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`/projects/${id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ revision: p.revision, removeFileIds: [deleteFile.id] }),
                });
                setDeleteFile(null);
              })
            }
          >
            Remover
          </button>
        </Modal>
      )}
      {publishOpen && (
        <Modal title="Publicar release" onClose={() => setPublishOpen(false)}>
          <label>
            Versão da release
            <input value={version} onChange={(e) => setVersion(e.target.value)} required />
          </label>
          <p>A release será imutável e poderá ser instalada pelo launcher Android.</p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Confirmo que posso distribuir os arquivos hospedados e que os downloads externos
            respeitam as permissões da origem.
          </label>
          {error && <Notice>{error}</Notice>}
          <button
            className="primary full"
            disabled={!confirmed || busy || !version.trim()}
            onClick={() =>
              void run(async () => {
                await post(`/projects/${id}/releases`, {
                  revision: p.revision,
                  version,
                  distributionConfirmed: true,
                });
                setPublishOpen(false);
              })
            }
          >
            Publicar
          </button>
        </Modal>
      )}
      {diffJob && (
        <Modal
          title={`Atualizar ${diff.data?.installed ?? ''} → ${diff.data?.newVersion ?? ''}`}
          onClose={() => setParams({})}
        >
          {diff.loading ? (
            <Loading />
          ) : diff.error ? (
            <Notice>{diff.error}</Notice>
          ) : (
            diff.data && (
              <>
                <div className="diff-summary">
                  {[
                    ['added', 'Adicionados'],
                    ['removed', 'Removidos'],
                    ['updated', 'Atualizados'],
                    ['config', 'Configs'],
                  ].map(([type, label]) => (
                    <div key={type}>
                      <strong>{diff.data!.changes.filter((c) => c.type === type).length}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <div className="diff-list">
                  {diff.data.changes.map((c) => (
                    <div key={c.key}>
                      <span className={`diff-type ${c.type}`}>
                        {c.type === 'added'
                          ? '+'
                          : c.type === 'removed'
                            ? '−'
                            : c.type === 'config'
                              ? '~'
                              : '↑'}
                      </span>
                      <span>{c.after?.name ?? c.before?.name}</span>
                      <small>{c.after?.filename ?? c.before?.filename}</small>
                    </div>
                  ))}
                </div>
                {diff.data.conflicts.map((c) => (
                  <label key={c.key}>
                    Conflito: {c.local?.name ?? c.upstream?.name ?? c.key}
                    <select
                      value={choices[c.key] ?? ''}
                      onChange={(e) =>
                        setChoices((s) => ({
                          ...s,
                          [c.key]: e.target.value as 'local' | 'upstream',
                        }))
                      }
                    >
                      <option value="">Escolha...</option>
                      <option value="local">Preservar nossa alteração</option>
                      <option value="upstream">Usar versão upstream</option>
                    </select>
                  </label>
                ))}
                {error && <Notice>{error}</Notice>}
                <button
                  className="primary full"
                  disabled={busy || diff.data.conflicts.some((c) => !choices[c.key])}
                  onClick={() =>
                    void run(async () => {
                      await post(`/projects/${id}/upstream/apply`, { jobId: diffJob, choices });
                      setParams({});
                      setChoices({});
                    })
                  }
                >
                  Atualizar rascunho
                </button>
              </>
            )
          )}
        </Modal>
      )}
    </>
  );
}
export function Jobs() {
  const jobs = useResource<Job[]>('/jobs');
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">PROCESSAMENTO</div>
        <div className="heading-row">
          <div>
            <h1>Atividade</h1>
            <p>Importações e builds do seu workspace.</p>
          </div>
          <button className="secondary" onClick={jobs.reload}>
            <RefreshCw size={17} />
            Atualizar
          </button>
        </div>
      </div>
      {jobs.error && <Notice>{jobs.error}</Notice>}
      {jobs.loading ? (
        <Loading />
      ) : jobs.data?.length ? (
        <div className="panel jobs-list">
          {jobs.data.map((job) => (
            <Link key={job.id} to={`/imports/${job.id}`}>
              <div className="file-glyph">
                {job.kind === 'build' ? <Smartphone size={20} /> : <FileArchive size={20} />}
              </div>
              <div>
                <strong>
                  {job.result?.bundle?.name ??
                    (job.kind === 'build' ? 'Build Android' : 'Importação de modpack')}
                </strong>
                <p>{job.progress.message}</p>
              </div>
              <span className="status-pill">{job.status}</span>
              <span className="muted">{new Date(job.createdAt).toLocaleString('pt-BR')}</span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="Nenhuma atividade ainda">Suas importações e builds aparecerão aqui.</Empty>
      )}
    </>
  );
}

export { LauncherDashboard, DiagnosticsPage, PerformancePage } from './launcher-pages';
