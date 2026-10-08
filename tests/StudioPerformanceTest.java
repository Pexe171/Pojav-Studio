package net.kdt.pojavlaunch.studio;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

public final class StudioPerformanceTest {
    private static void expect(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static String read(File root) throws Exception { return Files.readString(new File(root,"options.txt").toPath()); }
    public static void main(String[] args) throws Exception {
        File root=Files.createTempDirectory("studio-performance-test-").toFile();
        try {
            File options=new File(root,"options.txt");
            Files.writeString(options.toPath(),"renderDistance:12\r\nrenderDistance:16\r\nao:true\r\nrenderClouds:\"true\"\r\nkey_key.forward:key.keyboard.w\r\nresourcePacks:[\"OST.zip\"]\r\n");
            StudioPerformance.apply(root,"light","1.21.1",0);
            String light=read(root);
            expect(light.contains("renderDistance:4\n") && !light.contains("renderDistance:16"),"Duplicate distance not normalized");
            expect(light.contains("ao:false\n") && light.contains("renderClouds:\"false\"\n") && light.contains("maxFps:30\n"),"Invalid modern low settings");
            expect(light.contains("key_key.forward:key.keyboard.w") && light.contains("resourcePacks:[\"OST.zip\"]"),"Controls or resource packs changed");
            Files.writeString(options.toPath(),light.replace("renderDistance:4","renderDistance:8")+"volume:0.3\n");
            StudioPerformance.apply(root,"light","1.21.1",0);
            expect(read(root).contains("renderDistance:8"),"Manual in-game settings overwritten on next launch");
            StudioPerformance.apply(root,"balanced","1.21.1",1);
            expect(read(root).contains("renderDistance:6\n") && read(root).contains("maxFps:60\n"),"Balanced profile not applied");
            StudioPerformance.apply(root,"original","1.21.1",2);
            expect(read(root).contains("renderDistance:16\n") && read(root).contains("ao:true\n") && read(root).contains("volume:0.3\n"),"Original managed values not restored or unrelated edits lost");
            expect(!read(root).contains("maxFps:"),"Added option not removed on restore");
            StudioPerformance.apply(root,"light","1.12.2",3);
            expect(read(root).contains("ao:0\n") && read(root).contains("renderClouds:false\n"),"Legacy options invalid");
            try { StudioPerformance.apply(root,"invalid","1.21.1",4); throw new AssertionError("Invalid mode accepted"); }
            catch(java.io.IOException expected) {}
            Files.delete(options.toPath()); Files.createSymbolicLink(options.toPath(),new File(root,".studio-performance-original.txt").toPath());
            try { StudioPerformance.apply(root,"light","1.21.1",5); throw new AssertionError("Symlink accepted"); }
            catch(java.io.IOException expected) {}
            System.out.println("PASS: low/balanced/original profiles, modern/legacy formats, manual edits, controls, duplicate options and symlink rejection");
        } finally {
            try(java.util.stream.Stream<Path> paths=Files.walk(root.toPath())) {
                paths.sorted(java.util.Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(Exception e){throw new RuntimeException(e);}});
            }
        }
    }
}
