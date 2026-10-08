package net.kdt.pojavlaunch.studio;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

final class StudioPerformance {
    private StudioPerformance() {}
    static final Set<String> KEYS = new LinkedHashSet<>(Arrays.asList(
        "graphicsMode", "fancyGraphics", "ao", "particles", "mipmapLevels", "renderDistance",
        "simulationDistance", "maxFps", "biomeBlendRadius", "entityDistanceScaling", "entityShadows", "renderClouds"));

    static void apply(File root, String mode, String minecraft, long revision) throws IOException {
        if (!Arrays.asList("light", "balanced", "original").contains(mode)) throw new IOException("Perfil de desempenho inválido");
        File options = new File(root, "options.txt"), backup = new File(root, ".studio-performance-original.txt"), marker = new File(root, ".studio-performance-mode");
        for (File file : new File[]{options, backup, marker}) if (Files.isSymbolicLink(file.toPath())) throw new IOException("Link em configuração de desempenho");
        String state = "1:" + mode + ":" + revision;
        if (marker.isFile() && read(marker).equals(state)) return;
        String current = options.isFile() ? read(options) : "";
        if (!backup.isFile() && !mode.equals("original")) write(backup, current);
        Map<String, String> values = new LinkedHashMap<>();
        if (mode.equals("original")) {
            if (!backup.isFile()) { write(marker, state); return; }
            for (String line : read(backup).split("\\r?\\n")) {
                int colon = line.indexOf(':');
                if (colon > 0 && KEYS.contains(line.substring(0, colon))) values.put(line.substring(0, colon), line.substring(colon + 1));
            }
        } else {
            boolean light = mode.equals("light");
            values.put("graphicsMode", "0"); values.put("fancyGraphics", "false");
            boolean modern = !minecraft.startsWith("1.");
            if (!modern) try { modern = Integer.parseInt(minecraft.split("\\.")[1]) >= 19; } catch (RuntimeException ignored) {}
            values.put("ao", modern ? "false" : "0");
            values.put("particles", light ? "2" : "1"); values.put("mipmapLevels", "0");
            values.put("renderDistance", light ? "4" : "6"); values.put("simulationDistance", "5");
            values.put("maxFps", light ? "30" : "60"); values.put("biomeBlendRadius", "0");
            values.put("entityDistanceScaling", light ? "0.5" : "0.75"); values.put("entityShadows", "false");
            values.put("renderClouds", modern ? "\"false\"" : "false");
        }
        StringBuilder result = new StringBuilder();
        for (String line : current.split("\\r?\\n")) {
            int colon = line.indexOf(':');
            if (!line.isEmpty() && !(colon > 0 && KEYS.contains(line.substring(0, colon)))) result.append(line).append('\n');
        }
        for (Map.Entry<String, String> entry : values.entrySet()) result.append(entry.getKey()).append(':').append(entry.getValue()).append('\n');
        write(options, result.toString()); write(marker, state);
    }
    private static String read(File file) throws IOException {
        if (file.length() > 1048576) throw new IOException("Configuração gráfica excede o limite");
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }
    private static void write(File file, String text) throws IOException {
        Path temp = Files.createTempFile(file.getParentFile().toPath(), ".studio-options-", ".tmp");
        try {
            Files.write(temp, text.getBytes(StandardCharsets.UTF_8));
            try { Files.move(temp, file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException unsupported) { Files.move(temp, file.toPath(), StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(temp); }
    }
}
