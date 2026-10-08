package net.kdt.pojavlaunch.studio;
import java.io.*;
import java.nio.file.*;
import java.util.*;
public final class TelemetryQueueTest {
    private static void expect(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args)throws Exception{
        File root=Files.createTempDirectory("studio-telemetry-test-").toFile();
        try{
            TelemetryQueue q=new TelemetryQueue(root,3,1024,7L*86400000);
            q.write(UUID.randomUUID().toString(),"offline-event");
            expect(new TelemetryQueue(root,3,1024,7L*86400000).files().length==1,"Offline queue did not survive restart");
            for(int i=0;i<4;i++)q.write(UUID.randomUUID().toString(),"event-"+i);
            expect(q.files().length==3,"Count bound failed");
            q.write(UUID.randomUUID().toString(),"x".repeat(900));
            q.write(UUID.randomUUID().toString(),"y".repeat(900));
            long size=0;for(File file:q.files())size+=file.length();expect(size<=1024&&q.files().length>0,"Byte limit lost all events");
            File old=q.files()[0];old.setLastModified(System.currentTimeMillis()-8L*86400000);q.trim(System.currentTimeMillis());expect(!old.exists(),"Expired log retained");
            int retained=q.files().length;q.trim(System.currentTimeMillis());expect(q.files().length==retained,"Unacknowledged files deleted on retry");
            File hidden=new File(root,"not-an-event.json");Files.writeString(hidden.toPath(),"unrelated");q.clear();expect(q.files().length==0&&hidden.isFile(),"Consent withdrawal affected unrelated files");
            try{q.write("../outside","bad");throw new AssertionError("Unsafe ID accepted");}catch(IllegalArgumentException expected){}
            System.out.println("PASS: offline persistence, retry retention, count/byte/age bounds and consent withdrawal");
        }finally{try(java.util.stream.Stream<Path> paths=Files.walk(root.toPath())){paths.sorted(Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(IOException e){throw new RuntimeException(e);}});}}
    }
}
