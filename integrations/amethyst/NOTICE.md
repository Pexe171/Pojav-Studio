# Launcher upstream

O aplicativo Android deriva de [Amethyst Android](https://github.com/AngelAuraMC/Amethyst-Android), projeto baseado no PojavLauncher. Direitos dos autores originais são preservados. O launcher original é disponibilizado sob GNU LGPL versão 3; o arquivo `LICENSE` nesta pasta reproduz sua licença.

O commit usado está registrado em `launcher.lock.json`. `scripts/prepare-launcher.mjs` obtém o código exato e seus submódulos. `overlay` e `scripts/launcher-overlay.mjs` contêm as alterações para a biblioteca Pojav Studio, instalação por manifest próprio, relatórios consentidos e detecção de teclado. Modificações ao launcher permanecem sujeitas à licença original.

Os submódulos e bibliotecas conservam suas próprias licenças no checkout preparado. Disponibilize o código correspondente e os avisos de licença junto da distribuição do APK. Minecraft, runtimes, loaders e mods são obtidos separadamente dos respectivos provedores; não são parte deste repositório.
