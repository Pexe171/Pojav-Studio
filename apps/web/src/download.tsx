import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUpRight,
  Download,
  Gamepad2,
  Layers3,
  WifiOff,
  Smartphone,
  Github,
  Check,
} from 'lucide-react';
import './download.css';

export function DownloadPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Pojav Studio — Seu mundo, no seu bolso';
    return () => {
      document.title = previous;
    };
  }, []);
  return (
    <div className="download-site">
      <header className="download-nav">
        <Link className="download-logo" to="/download">
          <span className="mini-block" />
          POJAV<span>STUDIO</span>
        </Link>
        <nav aria-label="Navegação">
          <a href="#como-instalar">Como instalar</a>
          <a href="https://github.com/Pexe171/Pojav-Studio" target="_blank" rel="noreferrer">
            GitHub <ArrowUpRight size={14} />
          </a>
          <Link to="/">
            Entrar no painel <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="download-hero">
          <div className="download-copy">
            <span className="download-eyebrow">
              <span /> SEU PRÓXIMO MUNDO COMEÇA AQUI
            </span>
            <h1>
              Grandes mundos.
              <br />
              <em>Agora no seu bolso.</em>
            </h1>
            <p>
              Seus modpacks favoritos, uma biblioteca para chamar de sua. Explore Minecraft Java no
              Android com o Pojav Studio.
            </p>
            <a className="download-cta" href="/api/v1/public/launcher/download">
              <Download size={21} />
              Baixar para Android
              <ArrowUpRight size={19} />
            </a>
            <div className="download-meta">
              <Smartphone size={15} /> APK para Android <span>·</span> Download gratuito{' '}
              <span>·</span> Última versão disponível
            </div>
            <a className="download-discover" href="#experiencia">
              <ArrowDown size={15} /> Um novo jeito de explorar
            </a>
          </div>
          <div
            className="voxel-scene"
            role="img"
            aria-label="Bloco de grama em três dimensões flutuando sobre um terreno de blocos"
          >
            <div className="scene-grid" />
            <div className="scene-glow" />
            <span className="scene-orbit orbit-one" />
            <span className="scene-orbit orbit-two" />
            <span className="pixel-spark spark-one" />
            <span className="pixel-spark spark-two" />
            <span className="pixel-spark spark-three" />
            <div className="scene-cube">
              <div className="cube-face cube-top" />
              <div className="cube-face cube-front" />
              <div className="cube-face cube-right" />
            </div>
            <div className="cube-shadow" />
            <div className="scene-label label-top">
              <span className="label-dot" /> FEITO PARA EXPLORAR
            </div>
            <div className="scene-label label-bottom">
              <Gamepad2 size={18} />
              <div>
                Um launcher. Infinitos mundos.<small>Minecraft Java · Android</small>
              </div>
            </div>
            <span className="scene-coordinate">X: 128 &nbsp; Y: 64 &nbsp; Z: 256</span>
          </div>
        </section>
        <div className="download-marquee">
          <span>CONSTRUA.</span>
          <span>EXPLORE.</span>
          <span>PERSONALIZE.</span>
          <span>JOGUE DO SEU JEITO.</span>
        </div>
        <section id="experiencia" className="download-features">
          <div className="download-section-title">
            <span className="download-eyebrow">MENOS COMPLICAÇÃO. MAIS AVENTURA.</span>
            <h2>Sua biblioteca vai com você.</h2>
            <p>Da escolha do modpack ao próximo mundo, tudo em um só lugar.</p>
          </div>
          <div className="download-feature-grid">
            <article>
              <Layers3 />
              <span>01 / BIBLIOTECA</span>
              <h3>Escolha seu próximo mundo</h3>
              <p>
                Veja capas e versões dos modpacks publicados. Instale o que combina com sua próxima
                aventura.
              </p>
            </article>
            <article>
              <WifiOff />
              <span>02 / LIBERDADE</span>
              <h3>Instalou? Leve com você.</h3>
              <p>
                Depois de preparar todos os arquivos, seus mundos continuam disponíveis para jogar
                offline.
              </p>
            </article>
            <article>
              <Gamepad2 />
              <span>03 / SEU JEITO</span>
              <h3>Toque, teclado, escolha.</h3>
              <p>
                Use controles de toque ou conecte um teclado físico. Ajuste os controles para o seu
                jeito de jogar.
              </p>
            </article>
          </div>
        </section>
        <section className="download-install" id="como-instalar">
          <div>
            <span className="download-eyebrow">PRONTO PARA O PRIMEIRO BLOCO?</span>
            <h2>
              Baixe. Instale.
              <br />
              <em>Entre no seu mundo.</em>
            </h2>
            <p>Não precisa entrar no painel para baixar o launcher.</p>
            <a className="download-cta" href="/api/v1/public/launcher/download">
              <Download size={20} />
              Baixar o APK
              <ArrowUpRight size={18} />
            </a>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Baixe o aplicativo</h3>
                <p>Toque em baixar para receber a versão mais recente do APK.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Instale no Android</h3>
                <p>
                  Abra o arquivo e, se solicitado, permita a instalação por esse navegador ou
                  gerenciador de arquivos.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Escolha sua aventura</h3>
                <p>
                  Crie um perfil local ou entre com Microsoft, escolha um modpack e aguarde a
                  instalação inicial com internet.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <div className="download-note">
          <Check size={17} />
          <p>
            O desempenho depende do aparelho, renderizador e modpack. Servidores com autenticação
            exigem uma conta Microsoft com Minecraft Java. Novas versões são instaladas quando você
            escolher atualizar.
          </p>
        </div>
      </main>
      <footer className="download-footer">
        <Link className="download-logo" to="/download">
          <span className="mini-block" />
          POJAV<span>STUDIO</span>
        </Link>
        <p>Construído sobre Pojav / Amethyst. Sem afiliação com Mojang ou Microsoft.</p>
        <a href="https://github.com/Pexe171/Pojav-Studio" target="_blank" rel="noreferrer">
          <Github size={18} />
          Código aberto
          <ArrowUpRight size={15} />
        </a>
      </footer>
    </div>
  );
}
