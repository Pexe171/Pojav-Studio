package net.kdt.pojavlaunch.studio;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.concurrent.*;

public final class StudioFilesTest {
    public static void main(String[] args) throws Exception {
        File root = Files.createTempDirectory("studio-directory-test-").toFile();
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            File raced = new File(root, "race") {
                @Override public boolean mkdirs() {
                    super.mkdirs(); // Simulate the other download creating it first.
                    return false;
                }
            };
            StudioFiles.ensureDirectory(raced);
            if (!raced.isDirectory()) throw new AssertionError("Race was not tolerated");
            for (int round = 0; round < 100; round++) {
                File directory = new File(root, "round-" + round + "/mods");
                CountDownLatch start = new CountDownLatch(1);
                Future<?>[] results = new Future<?>[4];
                for (int i = 0; i < results.length; i++) results[i] = pool.submit(() -> {
                    start.await(); StudioFiles.ensureDirectory(directory); return null;
                });
                start.countDown();
                for (Future<?> result : results) result.get();
            }
            File blocked = new File(root, "file");
            Files.write(blocked.toPath(), new byte[]{1});
            try { StudioFiles.ensureDirectory(blocked); throw new AssertionError("File accepted as directory"); }
            catch (IOException expected) {}
            System.out.println("PASS: deterministic mkdir race, 400 concurrent directory operations, blocked path rejected");
        } finally {
            pool.shutdownNow();
            try (java.util.stream.Stream<java.nio.file.Path> paths = Files.walk(root.toPath())) {
                paths.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                    try { Files.delete(path); } catch (IOException e) { throw new RuntimeException(e); }
                });
            }
        }
    }
}
