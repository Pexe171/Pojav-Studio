package net.kdt.pojavlaunch.studio;

import android.app.Activity;
import android.content.Context;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.NewJREUtil;
import net.kdt.pojavlaunch.modloaders.ModloaderDownloadListener;
import net.kdt.pojavlaunch.modloaders.modpacks.api.ModLoader;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.multirt.MultiRTUtils;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;
import net.kdt.pojavlaunch.tasks.MinecraftDownloader;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.*;
import java.util.concurrent.*;

public final class StudioInstaller {
    public interface Progress {void update(String message,int completed,int total);}
    private final Activity activity;
    private final StudioApi api;
    public volatile boolean cancelled=false;
    public StudioInstaller(Activity activity,StudioApi api){this.activity=activity;this.api=api;}
    private static String identifier(String value) throws IOException {if(!value.matches("[a-zA-Z0-9_-]{1,100}"))throw new IOException("Identificador inválido");return value;}
    public static File instance(String projectId,String releaseId) throws IOException {return new File(Tools.DIR_GAME_HOME,"custom_instances/studio-"+identifier(projectId)+"/"+identifier(releaseId));}
    private static File destination(File root,String path) throws IOException {
        if(path.isEmpty()||path.startsWith("/")||path.contains("\\")||path.contains(":"))throw new IOException("Caminho inválido");
        for(String part:path.split("/",-1))if(part.isEmpty()||part.equals(".")||part.equals(".."))throw new IOException("Caminho inválido");
        File file=new File(root,path);if(!file.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator))throw new IOException("Caminho fora da instância");return file;
    }
    private void check() throws IOException {if(cancelled||Thread.currentThread().isInterrupted())throw new IOException("Instalação cancelada");}
    private boolean verified(File file,JSONObject entry) throws Exception {
        if(!file.isFile()||file.length()!=entry.getLong("size"))return false;
        JSONObject hashes=entry.getJSONObject("hashes");if(hashes.length()==0)throw new IOException("Arquivo sem hash");
        for(String algorithm:new String[]{"sha512","sha256","sha1","md5"})if(hashes.has(algorithm)){
            MessageDigest digest=MessageDigest.getInstance(algorithm.equals("sha512")?"SHA-512":algorithm.equals("sha256")?"SHA-256":algorithm.equals("sha1")?"SHA-1":"MD5");
            try(InputStream input=new FileInputStream(file)){byte[] buffer=new byte[65536];int read;while((read=input.read(buffer))!=-1){check();digest.update(buffer,0,read);}}
            StringBuilder hex=new StringBuilder();for(byte b:digest.digest())hex.append(String.format("%02x",b&255));if(!hex.toString().equalsIgnoreCase(hashes.getString(algorithm)))return false;
        }
        return true;
    }
    private void download(JSONObject entry,File file,JSONObject descriptor) throws Exception {
        if(verified(file,entry))return;
        URL url=new URL(descriptor.getString("url"));
        HttpURLConnection connection=null;
        try{
            for(int i=0;i<=5;i++){
                if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null)throw new IOException("Download exige HTTPS");
                connection=(HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(20000);connection.setReadTimeout(60000);
                int status=connection.getResponseCode();if((status==401||status==403)&&i==0){connection.disconnect();url=new URL(api.get(entry.getString("downloadEndpoint")).getString("url"));continue;}if(status>=300&&status<400){String next=connection.getHeaderField("Location");connection.disconnect();if(next==null||i==5)throw new IOException("Redirecionamento inválido");url=new URL(url,next);continue;}if(status!=200)throw new IOException("Download HTTP "+status);break;
            }
            if(connection==null)throw new IOException("Download indisponível");File parent=file.getParentFile();StudioFiles.ensureDirectory(parent);File partial=new File(file.getPath()+".studio-part");
            try(InputStream input=connection.getInputStream();OutputStream output=new FileOutputStream(partial)) {byte[] buffer=new byte[65536];long size=0;int count;while((count=input.read(buffer))!=-1){check();size+=count;if(size>entry.getLong("size"))throw new IOException("Arquivo maior que o manifest");output.write(buffer,0,count);}}
            if(!verified(partial,entry)){partial.delete();throw new IOException("Hash ou tamanho divergente: "+entry.getString("path"));}if(file.exists()&&!file.delete())throw new IOException("Não foi possível substituir arquivo");if(!partial.renameTo(file))throw new IOException("Não foi possível concluir download");
        }finally{if(connection!=null)connection.disconnect();}
    }
    public JSONObject install(JSONObject card,Progress progress) throws Exception {
        JSONObject manifest=api.get(card.getString("manifestEndpoint"));
        if(manifest.getInt("schemaVersion")!=1||!manifest.getString("projectId").equals(card.getString("id"))||!manifest.getString("releaseId").equals(card.getString("releaseId")))throw new IOException("Manifest não corresponde ao modpack");
        File finalDir=instance(manifest.getString("projectId"),manifest.getString("releaseId"));File stage=new File(finalDir.getPath()+"-staging");if(!stage.isDirectory()&&!stage.mkdirs())throw new IOException("Falha ao criar instância");
        JSONArray files=manifest.getJSONArray("files");
        downloadFiles(manifest,stage,progress);
        Tools.write(new File(activity.getFilesDir(),"studio-pending-install.json").getPath(),manifest.toString());
        int runtime=manifest.getInt("runtime");if(MultiRTUtils.getExactJreName(runtime)==null){progress.update("Preparando Java "+runtime,files.length(),files.length());boolean available=false;for(NewJREUtil.ExternalRuntime jre:NewJREUtil.ExternalRuntime.values())if(jre.majorVersion==runtime){jre.downloadRuntime(activity);available=true;break;}if(!available||MultiRTUtils.getExactJreName(runtime)==null)throw new IOException("Runtime Java indisponível");}
        JSONObject loader=manifest.getJSONObject("loader");if(!"vanilla".equals(loader.getString("type"))){ModLoader info=loader(manifest);File loaderJson=new File(Tools.DIR_HOME_VERSION,info.getVersionId()+"/"+info.getVersionId()+".json");if(!loaderJson.isFile()){
            progress.update("Preparando "+loader.getString("type"),files.length(),files.length());final Exception[] error={null};final File[] installer={null};
            info.getDownloadTask(new ModloaderDownloadListener(){public void onDownloadFinished(File f){installer[0]=f;}public void onDataNotAvailable(){error[0]=new IOException("Loader indisponível");}public void onDownloadError(Exception e){error[0]=e;}}).run();if(error[0]!=null)throw error[0];
            if(info.requiresGuiInstallation()){if(installer[0]==null)throw new IOException("Instalador do loader indisponível");Tools.write(new File(activity.getFilesDir(),"studio-pending-install.json").getPath(),manifest.toString());activity.runOnUiThread(()->activity.startActivity(info.getInstallationIntent(activity,installer[0])));return manifest;}
            if(!loaderJson.isFile())throw new IOException("Loader não foi instalado corretamente");
        }}
        progress.update("Preparando Minecraft para uso offline",files.length(),files.length());new MinecraftDownloader().prepareStudio(activity,"vanilla".equals(loader.getString("type"))?manifest.getString("minecraft"):loader(manifest).getVersionId());check();activate(manifest,stage,finalDir);new File(activity.getFilesDir(),"studio-pending-install.json").delete();return manifest;
    }
    private void downloadFiles(JSONObject manifest,File stage,Progress progress) throws Exception {
        JSONArray files=manifest.getJSONArray("files");
        List<JSONObject> missing=new ArrayList<>();Set<String> paths=new HashSet<>();
        int reused=0;
        for(int i=0;i<files.length();i++){
            check();JSONObject entry=files.getJSONObject(i);File target=destination(stage,entry.getString("path"));
            if(!paths.add(target.getCanonicalPath().toLowerCase(Locale.ROOT)))throw new IOException("Caminho duplicado no manifest");
            progress.update("Conferindo arquivos locais",i,files.length());
            if(verified(target,entry))reused++;else missing.add(entry);
        }
        Map<String,JSONObject> urls=new HashMap<>();
        for(int offset=0;offset<missing.size();offset+=64){
            check();progress.update("Preparando downloads diretos",reused,files.length());
            JSONArray ids=new JSONArray();for(int i=offset;i<Math.min(offset+64,missing.size());i++)ids.put(missing.get(i).getString("id"));
            JSONArray descriptors=api.post("/api/v1/public/releases/"+identifier(manifest.getString("releaseId"))+"/downloads",new JSONObject().put("fileIds",ids)).getJSONArray("files");
            for(int i=0;i<descriptors.length();i++){JSONObject descriptor=descriptors.getJSONObject(i);urls.put(descriptor.getString("id"),descriptor);}
        }
        ExecutorService pool=Executors.newFixedThreadPool(4);
        CompletionService<String> completed=new ExecutorCompletionService<>(pool);
        try{
            for(JSONObject entry:missing){JSONObject descriptor=urls.get(entry.getString("id"));if(descriptor==null)throw new IOException("URL de download ausente");
                completed.submit(()->{check();download(entry,destination(stage,entry.getString("path")),descriptor);return entry.getString("path");});}
            for(int i=0;i<missing.size();i++){
                check();Future<String> next=completed.poll(1,TimeUnit.SECONDS);if(next==null){i--;continue;}
                try{String path=next.get();progress.update("Baixando em paralelo · "+(reused+i+1)+"/"+files.length()+" · "+path,reused+i+1,files.length());}
                catch(ExecutionException e){Throwable cause=e.getCause();if(cause instanceof Exception)throw (Exception)cause;throw new IOException(cause);}
            }
        }finally{
            pool.shutdownNow();if(!pool.awaitTermination(65,TimeUnit.SECONDS))throw new IOException("Downloads ainda estão encerrando; aguarde antes de tentar novamente");
        }
    }
    public boolean completePending() throws Exception {
        File pending=new File(activity.getFilesDir(),"studio-pending-install.json");if(!pending.isFile())return false;JSONObject manifest=new JSONObject(Tools.read(pending.getPath()));
        String project=manifest.getString("projectId"),release=manifest.getString("releaseId");
        if(release.equals(activity.getSharedPreferences("studio",0).getString("installed:"+project,null))){pending.delete();return false;}
        String version=manifest.getString("minecraft");
        if(!"vanilla".equals(manifest.getJSONObject("loader").getString("type"))){ModLoader loader=loader(manifest);File json=new File(Tools.DIR_HOME_VERSION,loader.getVersionId()+"/"+loader.getVersionId()+".json");if(!json.isFile())return false;version=loader.getVersionId();}
        if(MultiRTUtils.getExactJreName(manifest.getInt("runtime"))==null)return false;
        new MinecraftDownloader().prepareStudio(activity,version);check();File finalDir=instance(project,release);activate(manifest,new File(finalDir.getPath()+"-staging"),finalDir);pending.delete();return true;
    }
    public JSONObject pending(String projectId) {
        try{File file=new File(activity.getFilesDir(),"studio-pending-install.json");if(!file.isFile())return null;JSONObject manifest=new JSONObject(Tools.read(file.getPath()));return projectId.equals(manifest.getString("projectId"))?manifest:null;}catch(Exception ignored){return null;}
    }
    public JSONObject resumePending(String projectId,Progress progress) throws Exception {
        JSONObject manifest=pending(projectId);if(manifest==null)throw new IOException("Instalação pendente não encontrada");
        if(completePending())return manifest;
        // Reuse the original release, even if a newer one is now in the catalog.
        JSONObject card=new JSONObject().put("id",projectId).put("releaseId",manifest.getString("releaseId"))
            .put("manifestEndpoint","/api/v1/public/releases/"+identifier(manifest.getString("releaseId"))+"/manifest");
        return install(card,progress);
    }
    private ModLoader loader(JSONObject manifest) throws Exception {JSONObject l=manifest.getJSONObject("loader");String type=l.getString("type");int id=type.equals("forge")?ModLoader.MOD_LOADER_FORGE:type.equals("fabric")?ModLoader.MOD_LOADER_FABRIC:type.equals("quilt")?ModLoader.MOD_LOADER_QUILT:type.equals("neoforge")?ModLoader.MOD_LOADER_NEOFORGE:-1;if(id<0)throw new IOException("Loader não suportado");return new ModLoader(id,l.getString("version"),manifest.getString("minecraft"));}
    private void activate(JSONObject manifest,File stage,File finalDir) throws Exception {
        JSONArray files=manifest.getJSONArray("files");for(int i=0;i<files.length();i++)if(!verified(destination(stage,files.getJSONObject(i).getString("path")),files.getJSONObject(i)))throw new IOException("Instalação incompleta");
        String projectId=manifest.getString("projectId"),releaseId=manifest.getString("releaseId");String old=activity.getSharedPreferences("studio",0).getString("installed:"+projectId,null);
        if(old!=null&&!old.equals(releaseId)){File previous=instance(projectId,old);for(String folder:new String[]{"saves","screenshots"})copyTree(new File(previous,folder),new File(stage,folder));for(String file:new String[]{"servers.dat"})copyTree(new File(previous,file),new File(stage,file));}
        JSONObject performance=manifest.optJSONObject("performance");if(performance!=null&&performance.optBoolean("enabled",false)){
            File options=new File(stage,"options.txt");String text=options.isFile()?Tools.read(options.getPath()):"";for(String key:new String[]{"renderDistance","simulationDistance","maxFps"}){text=text.replaceAll("(?m)^"+key+":.*(?:\\n|$)","");text+=key+":"+performance.getInt(key)+"\n";}Tools.write(options.getPath(),text);
        }
        Tools.write(new File(stage,".studio-manifest.json").getPath(),manifest.toString());if(!finalDir.exists()&&!stage.renameTo(finalDir))throw new IOException("Falha ao ativar instância");
        LauncherProfiles.load();String profileId=UUID.nameUUIDFromBytes(("studio:"+projectId).getBytes(StandardCharsets.UTF_8)).toString();MinecraftProfile profile=new MinecraftProfile();profile.name=manifest.getString("name");profile.gameDir="./custom_instances/studio-"+projectId+"/"+releaseId;profile.lastVersionId="vanilla".equals(manifest.getJSONObject("loader").getString("type"))?manifest.getString("minecraft"):loader(manifest).getVersionId();profile.javaDir=Tools.LAUNCHERPROFILES_RTPREFIX+MultiRTUtils.getExactJreName(manifest.getInt("runtime"));
        if(performance!=null&&!performance.isNull("renderer"))profile.pojavRendererName=performance.getString("renderer");
        LauncherProfiles.mainProfileJson.profiles.put(profileId,profile);LauncherProfiles.write();
        activity.getSharedPreferences("studio",0).edit().putString("previous:"+projectId,old).putString("installed:"+projectId,releaseId).apply();LauncherPreferences.DEFAULT_PREF.edit().putString(LauncherPreferences.PREF_KEY_CURRENT_PROFILE,profileId).apply();
    }
    private void copyTree(File source,File target) throws IOException {if(!source.exists())return;if(!source.getAbsolutePath().equals(source.getCanonicalPath()))throw new IOException("Link em dados locais");if(source.isDirectory()){if(!target.isDirectory()&&!target.mkdirs())throw new IOException("Falha ao preservar mundo");File[] files=source.listFiles();if(files!=null)for(File f:files)copyTree(f,new File(target,f.getName()));}else {if(!target.getParentFile().isDirectory())target.getParentFile().mkdirs();try(InputStream in=new FileInputStream(source);OutputStream out=new FileOutputStream(target)){byte[] bytes=new byte[65536];int count;while((count=in.read(bytes))!=-1)out.write(bytes,0,count);}}}
    public void selectInstalled(String projectId) throws Exception {
        String installed=activity.getSharedPreferences("studio",0).getString("installed:"+projectId,null);if(installed==null)throw new IOException("Modpack não instalado");File root=instance(projectId,installed);if(!new File(root,".studio-manifest.json").isFile())throw new IOException("Instalação local incompleta");
        LauncherProfiles.load();String profileId=UUID.nameUUIDFromBytes(("studio:"+projectId).getBytes(StandardCharsets.UTF_8)).toString();if(!LauncherProfiles.mainProfileJson.profiles.containsKey(profileId))throw new IOException("Perfil local não encontrado");LauncherPreferences.DEFAULT_PREF.edit().putString(LauncherPreferences.PREF_KEY_CURRENT_PROFILE,profileId).apply();
    }
    public void rollback(String projectId) throws Exception {
        String old=activity.getSharedPreferences("studio",0).getString("previous:"+projectId,null);if(old==null)throw new IOException("Nenhuma versão anterior disponível");File root=instance(projectId,old);JSONObject manifest=new JSONObject(Tools.read(new File(root,".studio-manifest.json").getPath()));
        LauncherProfiles.load();String profileId=UUID.nameUUIDFromBytes(("studio:"+projectId).getBytes(StandardCharsets.UTF_8)).toString();MinecraftProfile p=LauncherProfiles.mainProfileJson.profiles.get(profileId);if(p==null)throw new IOException("Perfil ausente");p.gameDir="./custom_instances/studio-"+projectId+"/"+old;p.lastVersionId="vanilla".equals(manifest.getJSONObject("loader").getString("type"))?manifest.getString("minecraft"):loader(manifest).getVersionId();p.javaDir=Tools.LAUNCHERPROFILES_RTPREFIX+MultiRTUtils.getExactJreName(manifest.getInt("runtime"));JSONObject performance=manifest.optJSONObject("performance");p.pojavRendererName=performance!=null&&!performance.isNull("renderer")?performance.getString("renderer"):null;LauncherProfiles.write();String current=activity.getSharedPreferences("studio",0).getString("installed:"+projectId,null);activity.getSharedPreferences("studio",0).edit().putString("installed:"+projectId,old).putString("previous:"+projectId,current).apply();
    }
}
