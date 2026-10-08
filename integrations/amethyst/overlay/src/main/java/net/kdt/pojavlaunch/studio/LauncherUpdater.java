package net.kdt.pojavlaunch.studio;

import android.app.Activity;
import android.app.Application;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import net.kdt.pojavlaunch.LauncherActivity;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Version checks are silent; API/network failures always allow offline use. */
public final class LauncherUpdater {
    private static boolean registered;
    private static final Object updateLock=new Object();
    private static final ExecutorService network=Executors.newFixedThreadPool(2);
    public static synchronized void register(Application application,StudioApi api){
        if(registered)return;registered=true;
        application.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks(){
            final Map<Activity,Guard> guards=new HashMap<>();
            public void onActivityResumed(Activity activity){
                if(!(activity instanceof StudioActivity)&&!(activity instanceof LauncherActivity))return;
                Guard guard=guards.get(activity);if(guard==null){guard=new Guard(activity,api);guards.put(activity,guard);}guard.resume();
            }
            public void onActivityPaused(Activity activity){Guard guard=guards.get(activity);if(guard!=null)guard.pause();}
            public void onActivityDestroyed(Activity activity){Guard guard=guards.remove(activity);if(guard!=null)guard.destroy();}
            public void onActivityCreated(Activity activity,Bundle state){}
            public void onActivityStarted(Activity activity){}
            public void onActivityStopped(Activity activity){}
            public void onActivitySaveInstanceState(Activity activity,Bundle state){}
        });
    }
    private static final class Guard {
        final Activity activity;final StudioApi api;final Handler ui=new Handler(Looper.getMainLooper());
        boolean active,checking,downloading,waitingPermission;AlertDialog dialog;File readyApk;
        final Runnable periodic=new Runnable(){public void run(){check();if(active)ui.postDelayed(this,120000);}};
        Guard(Activity activity,StudioApi api){this.activity=activity;this.api=api;}
        void resume(){active=true;ui.removeCallbacks(periodic);ui.postDelayed(periodic,120000);
            if(waitingPermission){waitingPermission=false;if(readyApk!=null&&canInstall()){openInstaller();return;}}
            check();
        }
        void pause(){active=false;ui.removeCallbacks(periodic);}
        void destroy(){pause();if(dialog!=null)dialog.dismiss();dialog=null;}
        boolean canInstall(){return Build.VERSION.SDK_INT<26||activity.getPackageManager().canRequestPackageInstalls();}
        void check(){
            if(checking||downloading||activity.isFinishing())return;checking=true;
            network.execute(()->{
                JSONObject latest=null;
                try{latest=api.getFast("/api/v1/public/launcher/version");}catch(Exception ignored){}
                final JSONObject result=latest;
                ui.post(()->{checking=false;if(!active||activity.isFinishing()||activity.isDestroyed())return;
                    try{
                        int installed=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionCode;
                        if(result!=null&&result.getInt("minimumVersionCode")>installed){show(result);return;}
                    }catch(Exception ignored){}
                    // No cached minimum is enforced offline, even if a prior check found an update.
                    if(dialog!=null){dialog.dismiss();dialog=null;}
                });
            });
        }
        void show(JSONObject latest){
            if(dialog!=null&&dialog.isShowing())return;
            dialog=new AlertDialog.Builder(activity).setTitle("Atualização disponível")
                .setMessage("A versão "+latest.optString("versionName")+" do Pojav Studio está disponível. Atualize o aplicativo para continuar online. Seus modpacks e mundos serão preservados.")
                .setCancelable(false).setPositiveButton("Atualizar",null).setNeutralButton("Verificar conexão",null)
                .setNegativeButton("Sair",(d,w)->activity.finish()).create();
            dialog.setOnShowListener(ignored->{dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->download());
                dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->check());});dialog.show();
        }
        void message(String text){if(dialog!=null&&dialog.isShowing())dialog.setMessage(text);}
        void download(){
            if(downloading)return;downloading=true;message("Baixando a atualização... A instalação será confirmada pelo Android.");
            network.execute(()->{
                synchronized(updateLock){
                File apk=null;Exception failure=null;
                try{
                    if(activity.isFinishing()||activity.isDestroyed())throw new IOException("Atualização interrompida");
                    JSONObject latest=api.getFast("/api/v1/public/launcher/version");
                    String expected=latest.getString("sha256");if(!expected.matches("[a-fA-F0-9]{64}"))throw new IOException("Hash de atualização inválido");
                    File directory=new File(activity.getCacheDir(),"studio-updates");if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Não foi possível preparar a atualização");
                    File partial=new File(directory,"launcher.part");apk=new File(directory,"launcher-"+latest.getInt("versionCode")+".apk");
                    URL url=new URL(latest.getString("url"));HttpURLConnection connection=null;
                    try{
                        for(int redirects=0;redirects<=5;redirects++){
                            if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||(url.getPort()!=-1&&url.getPort()!=443)||!url.getHost().equalsIgnoreCase(latest.getString("downloadHost")))throw new IOException("Origem da atualização não autorizada");
                            connection=(HttpURLConnection)url.openConnection();connection.setConnectTimeout(15000);connection.setReadTimeout(30000);connection.setInstanceFollowRedirects(false);
                            int code=connection.getResponseCode();if(code>=300&&code<400){String location=connection.getHeaderField("Location");connection.disconnect();if(location==null||redirects==5)throw new IOException("Redirecionamento inválido");url=new URL(url,location);continue;}
                            if(code!=200)throw new IOException("Download HTTP "+code);break;
                        }
                        MessageDigest digest=MessageDigest.getInstance("SHA-256");long size=0,last=0;
                        try(InputStream input=connection.getInputStream();OutputStream output=new FileOutputStream(partial)){
                            byte[] bytes=new byte[65536];int count;
                            while((count=input.read(bytes))!=-1){if(Thread.currentThread().isInterrupted()||activity.isFinishing()||activity.isDestroyed())throw new IOException("Atualização interrompida");size+=count;if(size>268435456)throw new IOException("Atualização excede o limite");digest.update(bytes,0,count);output.write(bytes,0,count);
                                if(System.currentTimeMillis()-last>1000){last=System.currentTimeMillis();final long received=size;ui.post(()->message("Baixando atualização: "+received/1048576+" MB. Seus dados serão preservados."));}}
                        }
                        StringBuilder actual=new StringBuilder();for(byte b:digest.digest())actual.append(String.format("%02x",b&255));
                        if(!actual.toString().equalsIgnoreCase(expected))throw new IOException("A atualização falhou na verificação de integridade");
                        if(apk.exists()&&!apk.delete())throw new IOException("Não foi possível substituir o APK");if(!partial.renameTo(apk))throw new IOException("Não foi possível concluir o download");
                        PackageManager pm=activity.getPackageManager();PackageInfo archive=pm.getPackageArchiveInfo(apk.getPath(),PackageManager.GET_SIGNATURES);
                        PackageInfo current=pm.getPackageInfo(activity.getPackageName(),PackageManager.GET_SIGNATURES);
                        if(archive==null||!activity.getPackageName().equals(archive.packageName)||archive.versionCode!=latest.getInt("versionCode")||archive.versionCode<=current.versionCode||archive.signatures==null||archive.signatures.length!=1||current.signatures==null||current.signatures.length!=1||!Arrays.equals(archive.signatures[0].toByteArray(),current.signatures[0].toByteArray()))throw new IOException("APK não corresponde à assinatura e versão deste aplicativo");
                    }finally{if(connection!=null)connection.disconnect();partial.delete();}
                }catch(Exception error){failure=error;if(apk!=null)apk.delete();}
                final File file=apk;final Exception error=failure;
                ui.post(()->{downloading=false;if(activity.isFinishing()||activity.isDestroyed())return;
                    if(error!=null){message("Não foi possível atualizar: "+error.getMessage()+". Tente novamente ou verifique a conexão para continuar offline.");return;}
                    readyApk=file;message("Atualização verificada. Confirme a instalação no Android.");openInstaller();});
                }
            });
        }
        void openInstaller(){
            try{
                if(!canInstall()){waitingPermission=true;activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));return;}
                Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".studio.updates",readyApk);
                activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
            }catch(Exception error){message("Não foi possível abrir o instalador: "+error.getMessage()+". Você também pode baixar o APK pela página do Pojav Studio.");}
        }
    }
}
