package net.kdt.pojavlaunch.studio;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.UUID;

/** Shared state for the separate launcher, job and game processes. */
final class TelemetryIdentity {
    private final File root;
    TelemetryIdentity(File root)throws IOException{this.root=root;StudioFiles.ensureDirectory(root);}
    boolean enabled(boolean legacy){
        File state=new File(root,"consent");
        if(!state.exists())return legacy;
        try{return !Files.isSymbolicLink(state.toPath())&&state.length()<=16&&new String(Files.readAllBytes(state.toPath()),StandardCharsets.UTF_8).equals("enabled");}
        catch(IOException error){return false;}
    }
    void setEnabled(boolean value)throws IOException{
        Path temp=Files.createTempFile(root.toPath(),".consent-",".tmp");
        try{Files.write(temp,(value?"enabled":"disabled").getBytes(StandardCharsets.UTF_8));Files.move(temp,new File(root,"consent").toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}
        finally{Files.deleteIfExists(temp);}
    }
    synchronized String deviceId(String legacy)throws IOException{
        Path path=new File(root,"device-id").toPath();
        if(Files.isSymbolicLink(path))throw new IOException("Invalid device identity");
        try(FileChannel channel=FileChannel.open(path,StandardOpenOption.CREATE,StandardOpenOption.READ,StandardOpenOption.WRITE);FileLock lock=channel.lock()){
            if(channel.size()>0&&channel.size()<=36){ByteBuffer bytes=ByteBuffer.allocate((int)channel.size());while(bytes.hasRemaining()&&channel.read(bytes)>0){}String value=new String(bytes.array(),StandardCharsets.UTF_8);try{return UUID.fromString(value).toString();}catch(IllegalArgumentException ignored){}}
            String value;try{value=UUID.fromString(legacy).toString();}catch(Exception invalid){value=UUID.randomUUID().toString();}
            channel.truncate(0);channel.position(0);ByteBuffer bytes=ByteBuffer.wrap(value.getBytes(StandardCharsets.UTF_8));while(bytes.hasRemaining())channel.write(bytes);channel.force(false);return value;
        }
    }
}
