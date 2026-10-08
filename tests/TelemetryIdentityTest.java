package net.kdt.pojavlaunch.studio;
import java.io.*;
import java.nio.file.*;
import java.util.*;
public final class TelemetryIdentityTest {
    static void expect(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args)throws Exception{
        if(args.length>0){System.out.println(new TelemetryIdentity(new File(args[0])).deviceId(null));return;}
        File root=Files.createTempDirectory("studio-identity-test-").toFile();
        try{
            TelemetryIdentity launcher=new TelemetryIdentity(root),game=new TelemetryIdentity(root);
            expect(!launcher.enabled(false),"Default consent");
            launcher.setEnabled(true);expect(game.enabled(false),"Game did not observe launcher consent");
            launcher.setEnabled(false);expect(!game.enabled(true),"Stale game preference overrode withdrawal");
            String legacy=UUID.randomUUID().toString();expect(launcher.deviceId(legacy).equals(legacy),"Identity migration");
            expect(game.deviceId(UUID.randomUUID().toString()).equals(legacy),"Processes changed identity");
            Files.delete(new File(root,"device-id").toPath());
            List<Process> children=new ArrayList<>();for(int i=0;i<4;i++)children.add(new ProcessBuilder(new File(System.getProperty("java.home"),"bin/java").getPath(),"-cp",System.getProperty("java.class.path"),TelemetryIdentityTest.class.getName(),root.getPath()).redirectErrorStream(true).start());
            Set<String> results=new HashSet<>();for(Process child:children){String result=new String(child.getInputStream().readAllBytes()).trim();expect(child.waitFor()==0,"Child failed: "+result);results.add(result);}
            expect(results.size()==1,"Concurrent processes generated different identities");UUID.fromString(results.iterator().next());
            System.out.println("PASS: cross-process consent, withdrawal, legacy migration and concurrent device identity");
        }finally{try(var paths=Files.walk(root.toPath())){paths.sorted(Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(IOException e){throw new RuntimeException(e);}});}}
    }
}
