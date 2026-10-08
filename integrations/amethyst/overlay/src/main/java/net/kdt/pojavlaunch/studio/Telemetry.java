package net.kdt.pojavlaunch.studio;

import android.app.*;
import android.app.job.*;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.*;
import net.kdt.pojavlaunch.BuildConfig;
import net.kdt.pojavlaunch.Tools;
import org.json.*;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;

/** Bounded, opt-in delivery. No per-frame hooks, sensors, IMEI or account identifiers. */
public final class Telemetry {
    private static Application app;
    private static StudioApi api;
    private static final ExecutorService worker=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(64),r->{Thread t=new Thread(r,"StudioTelemetry");t.setPriority(Thread.MIN_PRIORITY);return t;},new ThreadPoolExecutor.DiscardPolicy());
    private static final Handler ui=new Handler(Looper.getMainLooper());
    private static volatile long nextSend;
    private static final String session=UUID.randomUUID().toString();
    private static volatile String gameSession=session;
    private static String gameProject,gameRelease;
    private static long gameStarted;
    private static volatile boolean gameActive;
    private static int foreground;
    private static final long WEEK=7L*86400000, MAX_BYTES=5L*1048576;
    private static final int JOB_ID=41173;
    public interface Completion {void done(boolean remaining);}
    public static void sendInBackground(Completion completion){worker.execute(()->{nextSend=0;flush();completion.done(enabled()&&queueFiles().length>0);});}
    private static void schedule(){
        if(!enabled())return;
        JobScheduler scheduler=(JobScheduler)app.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if(scheduler==null)return;
        for(JobInfo job:scheduler.getAllPendingJobs())if(job.getId()==JOB_ID)return;
        JobInfo.Builder job=new JobInfo.Builder(JOB_ID,new ComponentName(app,TelemetryJobService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(60000).setPersisted(true)
            .setBackoffCriteria(300000,JobInfo.BACKOFF_POLICY_EXPONENTIAL);
        if(Build.VERSION.SDK_INT>=26)job.setRequiresBatteryNotLow(true);
        scheduler.schedule(job.build());
    }
    private static SharedPreferences prefs(){return app.getSharedPreferences("studio",0);}
    private static boolean enabled(){return app!=null&&prefs().getBoolean("telemetryEnabled",false);}
    private static File folder(){File dir=new File(app.getFilesDir(),"studio-telemetry");dir.mkdirs();return dir;}
    private static TelemetryQueue queue()throws IOException{return new TelemetryQueue(folder(),100,MAX_BYTES,WEEK);}
    private static final Runnable timer=new Runnable(){public void run(){if(foreground>0){worker.execute(()->{if(gameActive)captureLog(gameProject,gameRelease);flush();});ui.postDelayed(this,300000);}}};

    public static synchronized void register(Application application,StudioApi client){
        if(app!=null)return;app=application;api=client;
        worker.execute(()->{
            if(!enabled())return;
            File active=new File(folder(),"active-session.json");
            if(active.isFile())try{JSONObject previous=new JSONObject(Tools.read(active.getPath()));
                String previousSession=previous.optString("sessionId",session);
                captureLog(previous.optString("projectId",null),previous.optString("releaseId",null),previousSession);
                recordNow("session-interrupted",previous.optString("projectId",null),previous.optString("releaseId",null),new JSONObject().put("message","Execução anterior não registrou saída; pode ter sido encerrada pelo usuário ou Android."),"",previousSession);active.delete();
            }catch(Exception ignored){active.delete();}
            flush();
        });
        application.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks(){
            public void onActivityStarted(Activity activity){foreground++;ui.removeCallbacks(timer);ui.postDelayed(timer,300000);worker.execute(Telemetry::flush);}
            public void onActivityStopped(Activity activity){foreground=Math.max(0,foreground-1);if(foreground==0)ui.removeCallbacks(timer);}
            public void onActivityResumed(Activity activity){
                if(activity.getClass().getName().equals("net.kdt.pojavlaunch.MainActivity")&&!gameActive&&enabled()){
                    gameActive=true;gameStarted=SystemClock.elapsedRealtime();gameSession=UUID.randomUUID().toString();
                    gameProject=prefs().getString("lastPlayedProject",null);gameRelease=gameProject==null?null:prefs().getString("installed:"+gameProject,null);
                    try{
                        String profileId=net.kdt.pojavlaunch.prefs.LauncherPreferences.DEFAULT_PREF.getString(net.kdt.pojavlaunch.prefs.LauncherPreferences.PREF_KEY_CURRENT_PROFILE,null);
                        net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile profile=net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles.mainProfileJson.profiles.get(profileId);
                        String expected="./custom_instances/studio-"+gameProject+"/"+gameRelease;
                        if(profile==null||!expected.equals(profile.gameDir)){gameProject=null;gameRelease=null;}
                    }catch(Exception ignored){gameProject=null;gameRelease=null;}
                    final String project=gameProject,release=gameRelease,launchSession=gameSession;
                    worker.execute(()->{try{
                        JSONObject state=new JSONObject().put("projectId",project).put("releaseId",release).put("sessionId",launchSession);
                        Tools.write(new File(folder(),"active-session.json").getPath(),state.toString());
                        recordNow("game-start",project,release,new JSONObject().put("performanceMode",prefs().getString("performanceMode","light")),"",launchSession);flush();
                    }catch(Exception ignored){}});
                }
            }
            public void onActivityDestroyed(Activity activity){}
            public void onActivityCreated(Activity activity,Bundle state){}
            public void onActivityPaused(Activity activity){}
            public void onActivitySaveInstanceState(Activity activity,Bundle state){}
        });
    }
    public static void askConsent(Activity activity){if(app!=null&&!prefs().contains("telemetryEnabled"))showSettings(activity);}
    public static void showSettings(Activity activity){
        new AlertDialog.Builder(activity).setTitle("Relatórios automáticos")
            .setMessage("Enviar logs e eventos por aparelho, modpack e versão para ajudar a investigar erros?\n\nInclui modelo, Android, versão do launcher e um código aleatório deste aplicativo. Credenciais identificadas são removidas. Sem internet, a fila fica neste aparelho por até 7 dias, limitada a 5 MB. O envio ocorre em segundo plano. Você pode desativar depois e apagar a fila local.\n\nEstado atual: "+(enabled()?"ativado":"desativado"))
            .setPositiveButton("Aceitar e ativar",(d,w)->{prefs().edit().putBoolean("telemetryEnabled",true).apply();nextSend=0;worker.execute(Telemetry::flush);})
            .setNegativeButton("Desativar e apagar fila",(d,w)->{prefs().edit().putBoolean("telemetryEnabled",false).apply();gameActive=false;JobScheduler scheduler=(JobScheduler)app.getSystemService(Context.JOB_SCHEDULER_SERVICE);if(scheduler!=null)scheduler.cancel(JOB_ID);worker.execute(()->{for(File file:queueFiles())file.delete();new File(folder(),"active-session.json").delete();});})
            .setNeutralButton("Fechar",null).show();
    }
    public static void record(String kind,String project,String release,JSONObject data){
        if(!enabled())return;
        final String snapshot=data==null?"{}":data.toString();
        worker.execute(()->{try{recordNow(kind,project,release,new JSONObject(snapshot),"");flush();}catch(Exception ignored){}});
    }
    public static void gameExit(Activity activity,int code){
        if(!gameActive||!enabled())return;
        final String project=gameProject,release=gameRelease,exitSession=gameSession;final long elapsed=Math.min(WEEK,Math.max(0,SystemClock.elapsedRealtime()-gameStarted));gameActive=false;
        worker.execute(()->{try{captureLog(project,release,exitSession);recordNow("game-exit",project,release,new JSONObject().put("exitCode",code).put("durationMs",elapsed),"",exitSession);new File(folder(),"active-session.json").delete();flush();}catch(Exception ignored){}});
    }
    private static void captureLog(String project,String release){
        captureLog(project,release,gameSession);
    }
    private static void captureLog(String project,String release,String eventSession){
        if(!enabled()||project==null||release==null)return;
        try{
            File file=new File(StudioInstaller.instance(project,release),"logs/latest.log");
            if(!file.isFile())file=new File(Tools.DIR_GAME_HOME,"latestlog.txt");if(!file.isFile())return;
            String key="telemetryLog:"+project+":"+release,signature=file.length()+":"+file.lastModified();
            if(signature.equals(prefs().getString(key,"")))return;
            byte[] bytes;try(RandomAccessFile input=new RandomAccessFile(file,"r")){long start=Math.max(0,input.length()-16384);input.seek(start);bytes=new byte[(int)(input.length()-start)];input.readFully(bytes);}
            recordNow("game-log",project,release,new JSONObject().put("logBytes",file.length()),new String(bytes,"UTF-8"),eventSession);
            prefs().edit().putString(key,signature).apply();
        }catch(Exception ignored){}
    }
    private static String timestamp(){SimpleDateFormat format=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US);format.setTimeZone(TimeZone.getTimeZone("UTC"));return format.format(new Date());}
    private static void recordNow(String kind,String project,String release,JSONObject data,String log)throws Exception{
        recordNow(kind,project,release,data,log,session);
    }
    private static void recordNow(String kind,String project,String release,JSONObject data,String log,String eventSession)throws Exception{
        if(!enabled())return;
        if(data.has("message"))data.put("message",Diagnostics.redact(data.getString("message").substring(0,Math.min(2000,data.getString("message").length()))));
        JSONObject event=new JSONObject().put("id",UUID.randomUUID().toString()).put("sessionId",eventSession).put("kind",kind).put("launcherVersion",BuildConfig.VERSION_NAME).put("occurredAt",timestamp()).put("data",data).put("log",Diagnostics.redact(log.substring(Math.max(0,log.length()-16384))));
        if(project!=null)event.put("projectId",project);if(release!=null&&project!=null)event.put("releaseId",release);
        queue().write(event.getString("id"),event.toString());
        schedule();
    }
    private static File[] queueFiles(){try{return queue().files();}catch(IOException ignored){return new File[0];}}
    private static void trim(){try{queue().trim(System.currentTimeMillis());}catch(IOException ignored){}}
    private static void flush(){
        if(!enabled()||System.currentTimeMillis()<nextSend)return;
        trim();File[] files=queueFiles();if(files.length==0)return;
        nextSend=System.currentTimeMillis()+60000;
        Map<String,File> sent=new HashMap<>();
        try{
            JSONArray events=new JSONArray();
            for(File file:files){if(events.length()==10)break;try{JSONObject e=new JSONObject(Tools.read(file.getPath()));events.put(e);sent.put(e.getString("id"),file);}catch(Exception invalid){file.delete();}}
            if(events.length()==0||!enabled())return;
            String device=prefs().getString("telemetryDeviceId",null);if(device==null){device=UUID.randomUUID().toString();prefs().edit().putString("telemetryDeviceId",device).apply();}
            JSONObject info=new JSONObject().put("model",Build.MODEL).put("android",Build.VERSION.RELEASE).put("architecture",Build.SUPPORTED_ABIS[0]);
            JSONObject payload=new JSONObject().put("consent",true).put("deviceId",device).put("device",info).put("events",events);
            JSONObject response=api.postFast("/api/v1/public/telemetry",payload);
            JSONArray accepted=response.getJSONArray("accepted");for(int i=0;i<accepted.length();i++){File file=sent.get(accepted.getString(i));if(file!=null)file.delete();}
            nextSend=System.currentTimeMillis()+60000;
        }catch(StudioApi.ApiException rejected){
            if(rejected.status==400){for(File file:sent.values())file.delete();}
            nextSend=System.currentTimeMillis()+300000;schedule();
        }catch(Exception offline){nextSend=System.currentTimeMillis()+300000;schedule();}
    }
}
