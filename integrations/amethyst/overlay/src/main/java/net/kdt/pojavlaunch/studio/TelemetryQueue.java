package net.kdt.pojavlaunch.studio;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

final class TelemetryQueue {
    private final File root;
    private final int maxCount;
    private final long maxBytes,maxAge;
    TelemetryQueue(File root,int maxCount,long maxBytes,long maxAge)throws IOException{
        this.root=root;this.maxCount=maxCount;this.maxBytes=maxBytes;this.maxAge=maxAge;
        if(Files.isSymbolicLink(root.toPath()))throw new IOException("Invalid telemetry directory");
        StudioFiles.ensureDirectory(root);
    }
    File[] files(){
        File[] files=root.listFiles((dir,name)->name.matches("[0-9]+-[a-f0-9-]+\\.json"));if(files==null)return new File[0];
        files=Arrays.stream(files).filter(f->f.isFile()&&!Files.isSymbolicLink(f.toPath())).toArray(File[]::new);
        Arrays.sort(files,Comparator.comparing(File::getName));return files;
    }
    void write(String id,String payload)throws IOException{
        UUID.fromString(id);byte[] bytes=payload.getBytes(StandardCharsets.UTF_8);if(bytes.length>131072)throw new IOException("Telemetry event too large");
        File target=new File(root,System.currentTimeMillis()+"-"+id+".json");
        Path temp=Files.createTempFile(root.toPath(),".event-",".tmp");
        try{Files.write(temp,bytes);Files.move(temp,target.toPath(),StandardCopyOption.REPLACE_EXISTING);}finally{Files.deleteIfExists(temp);}
        trim(System.currentTimeMillis());
    }
    void trim(long now){
        File[] files=files();long size=0;for(File file:files)size+=file.length();int count=files.length;
        for(File file:files)if(file.lastModified()<now-maxAge||size>maxBytes||count>maxCount){long length=file.length();if(file.delete()){size-=length;count--;}}
        File[] leftovers=root.listFiles((dir,name)->name.startsWith(".event-")&&name.endsWith(".tmp"));
        if(leftovers!=null)for(File file:leftovers)if(file.lastModified()<now-3600000&&!Files.isSymbolicLink(file.toPath()))file.delete();
    }
    void clear(){for(File file:files())file.delete();}
}
