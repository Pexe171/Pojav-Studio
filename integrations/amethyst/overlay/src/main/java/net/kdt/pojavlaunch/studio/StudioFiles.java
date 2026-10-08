package net.kdt.pojavlaunch.studio;

import java.io.File;
import java.io.IOException;

final class StudioFiles {
    private StudioFiles() {}

    static void ensureDirectory(File directory) throws IOException {
        // Another download can create the same parent between the first check and mkdirs.
        if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) {
            throw new IOException("Falha ao criar diretório: " + directory.getName());
        }
    }
}
