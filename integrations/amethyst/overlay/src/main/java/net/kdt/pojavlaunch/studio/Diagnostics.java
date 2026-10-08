package net.kdt.pojavlaunch.studio;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Build;
import android.widget.Toast;
import android.widget.ScrollView;
import android.widget.TextView;
import net.kdt.pojavlaunch.BuildConfig;
import net.kdt.pojavlaunch.Tools;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.util.concurrent.Executor;

public final class Diagnostics {
    public static void recordGameExit(Activity activity,int code) {
        Telemetry.gameExit(activity,code);
        if(code!=0)activity.getSharedPreferences("studio",0).edit().putInt("pendingGameExit",code).apply();
    }
    public static String redact(String text) {
        return text.replaceAll("(?i)(Bearer\\s+)[A-Za-z0-9._~+/=-]+","$1[REDACTED]")
            .replaceAll("(?i)((?:access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|x-api-key|session[_-]?id|--accessToken)[\\\"'\\s:=]+)[^\\s,\\\"';&]+","$1[REDACTED]")
            .replaceAll("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}","[EMAIL]")
            .replaceAll("/storage/emulated/\\d+|/data/user/\\d+/[^\\s/]+","[LOCAL_PATH]");
    }
    public static void offer(Activity activity,StudioApi api,Executor executor,String kind,String message,String log,String projectId,String releaseId,Runnable acknowledged) {
        String sanitized=redact(log.substring(0,Math.min(log.length(),524288)));
        activity.runOnUiThread(()->{
            TextView preview=new TextView(activity);preview.setText("Enviar este relatório para ajudar a investigar? O envio é opcional. Tokens e emails identificados foram removidos.\n\n"+sanitized);preview.setTextSize(13);preview.setPadding(24,16,24,16);
            ScrollView scroll=new ScrollView(activity);scroll.addView(preview);
            new AlertDialog.Builder(activity).setTitle("Enviar relatório de erro?").setView(scroll)
                .setNegativeButton("Não enviar",(dialog,which)->acknowledged.run())
                .setPositiveButton("Enviar",(dialog,which)->executor.execute(()->{
                    try{
                        JSONObject report=new JSONObject();report.put("consent",true);report.put("kind",kind);report.put("launcherVersion",BuildConfig.VERSION_NAME);report.put("message",redact(message.substring(0,Math.min(message.length(),2000))));report.put("log",sanitized);
                        JSONObject device=new JSONObject();device.put("model",Build.MODEL);device.put("android",Build.VERSION.RELEASE);device.put("architecture",Build.SUPPORTED_ABIS[0]);report.put("device",device);
                        if(projectId!=null)report.put("projectId",projectId);if(releaseId!=null)report.put("releaseId",releaseId);
                        api.post("/api/v1/public/diagnostics",report);activity.runOnUiThread(()->Toast.makeText(activity,"Relatório enviado. Obrigado!",Toast.LENGTH_LONG).show());acknowledged.run();
                    }catch(Exception error){activity.runOnUiThread(()->Toast.makeText(activity,"Não foi possível enviar. O relatório continua salvo localmente.",Toast.LENGTH_LONG).show());}
                })).show();
        });
    }
    public static void checkSavedCrash(Activity activity,StudioApi api,Executor executor) {
        File crash=new File(Tools.DIR_GAME_HOME,"latestcrash.txt");
        long seen=activity.getSharedPreferences("studio",0).getLong("lastCrashAcknowledged",0);
        if(crash.isFile()&&crash.lastModified()>seen)executor.execute(()->{
            try{String log=StudioApi.read(new FileInputStream(crash),524288);long timestamp=crash.lastModified();offer(activity,api,executor,"launcher-crash","Erro do launcher",log,null,null,()->activity.getSharedPreferences("studio",0).edit().putLong("lastCrashAcknowledged",timestamp).apply());}catch(Exception ignored){}
        });
    }
}
