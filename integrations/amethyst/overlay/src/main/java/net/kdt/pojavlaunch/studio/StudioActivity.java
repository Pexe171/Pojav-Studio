package net.kdt.pojavlaunch.studio;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.*;
import net.kdt.pojavlaunch.LauncherActivity;
import net.kdt.pojavlaunch.Tools;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** A public release library with cached metadata, explicit updates and independent local instances. */
public final class StudioActivity extends Activity {
    private StudioApi api;
    private StudioInstaller installer;
    private final ExecutorService jobs=Executors.newSingleThreadExecutor();
    private final ExecutorService images=Executors.newFixedThreadPool(3);
    private final Handler handler=new Handler(Looper.getMainLooper());
    private LinearLayout library;
    private TextView status;
    private ProgressBar progress;
    private JSONArray cards=new JSONArray();
    private boolean installing=false, refreshing=false;
    private long lastRefresh=0;
    private final Runnable periodic=new Runnable(){public void run(){if(!installing)refresh();handler.postDelayed(this,120000);}};
    private int dp(int value){return (int)(getResources().getDisplayMetrics().density*value);}
    private TextView text(String label,int size,int color){TextView view=new TextView(this);view.setText(label);view.setTextSize(size);view.setTextColor(color);return view;}
    private Button button(String label){Button view=new Button(this);view.setText(label);view.setAllCaps(false);return view;}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        try{api=new StudioApi(this);installer=new StudioInstaller(this,api);}catch(Exception e){new AlertDialog.Builder(this).setTitle("Configuração inválida").setMessage(e.getMessage()).setPositiveButton("Fechar",(d,w)->finish()).show();return;}
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(22),dp(24),dp(22),dp(12));root.setBackgroundColor(Color.rgb(16,18,27));
        TextView title=text(api.name,28,Color.WHITE);root.addView(title);
        TextView intro=text("Seus modpacks. Escolha um mundo para jogar.",15,Color.rgb(153,160,181));intro.setPadding(0,dp(8),0,dp(15));root.addView(intro);
        LinearLayout actions=new LinearLayout(this);Button refresh=button("Atualizar catálogo"),account=button("Conta / launcher"),controls=button("Controles");actions.addView(refresh);actions.addView(account);actions.addView(controls);HorizontalScrollView actionScroll=new HorizontalScrollView(this);actionScroll.addView(actions);root.addView(actionScroll);
        refresh.setOnClickListener(v->refresh());account.setOnClickListener(v->startActivity(new Intent(this,LauncherActivity.class)));controls.setOnClickListener(v->touchMode());
        status=text("Abrindo biblioteca local...",14,Color.rgb(180,166,223));status.setPadding(0,dp(12),0,dp(12));root.addView(status);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setVisibility(android.view.View.GONE);root.addView(progress);
        ScrollView scroll=new ScrollView(this);library=new LinearLayout(this);library.setOrientation(LinearLayout.VERTICAL);scroll.addView(library);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        LauncherUpdater.register(getApplication(),api);
        loadCache();render();refresh();Diagnostics.checkSavedCrash(this,api,jobs);
    }
    @Override protected void onResume(){super.onResume();if(installer==null)return;handler.removeCallbacks(periodic);handler.postDelayed(periodic,120000);jobs.execute(()->{try{if(installer.completePending())runOnUiThread(()->{installing=false;progress.setVisibility(android.view.View.GONE);status.setText("Instalação concluída. Disponível offline.");render();});}catch(Exception e){runOnUiThread(()->status.setText("Instalação do loader pendente: "+e.getMessage()));}});checkGameCrash();}
    @Override protected void onPause(){super.onPause();handler.removeCallbacks(periodic);}
    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);if(installer!=null)installer.cancelled=true;jobs.shutdownNow();images.shutdownNow();super.onDestroy();}
    private void touchMode(){String[] labels={"Automático: ocultar com teclado físico","Sempre mostrar botões","Sempre ocultar botões"};String[] values={"auto","show","hide"};String selected=getSharedPreferences("studio",0).getString("touchMode","auto");int index=Arrays.asList(values).indexOf(selected);new AlertDialog.Builder(this).setTitle("Controles de toque").setSingleChoiceItems(labels,index,(dialog,which)->{getSharedPreferences("studio",0).edit().putString("touchMode",values[which]).apply();dialog.dismiss();}).setNegativeButton("Fechar",null).show();}
    private void loadCache(){try{File cache=new File(getFilesDir(),"studio-catalog.json");if(cache.isFile())cards=new JSONArray(Tools.read(cache.getPath()));}catch(Exception ignored){}status.setText("Biblioteca salva neste dispositivo");}
    private void refresh(){if(api==null||refreshing||installing)return;refreshing=true;lastRefresh=System.currentTimeMillis();status.setText("Consultando catálogo...");jobs.execute(()->{
        try{
            JSONArray fetched=new JSONArray();int offset=0;do{JSONObject page=api.get("/api/v1/public/catalog?limit=100&offset="+offset);JSONArray items=page.getJSONArray("items");for(int i=0;i<items.length();i++)fetched.put(items.getJSONObject(i));offset=page.isNull("nextOffset")?-1:page.getInt("nextOffset");if(fetched.length()>10000)throw new IOException("Catálogo excede o limite");}while(offset>=0);
            Set<String> fresh=new HashSet<>();for(int i=0;i<fetched.length();i++)fresh.add(fetched.getJSONObject(i).getString("id"));for(int i=0;i<cards.length();i++){JSONObject old=cards.getJSONObject(i);if(!fresh.contains(old.getString("id"))&&installed(old.getString("id"))!=null)fetched.put(old);}
            Tools.write(new File(getFilesDir(),"studio-catalog.json").getPath(),fetched.toString());cards=fetched;runOnUiThread(()->{status.setText("Catálogo atualizado · "+cards.length()+" modpacks");render();});
        }catch(Exception error){runOnUiThread(()->{status.setText("Offline · seus modpacks instalados continuam disponíveis");render();});}finally{refreshing=false;}
    });}
    private String installed(String projectId){return getSharedPreferences("studio",0).getString("installed:"+projectId,null);}
    private void render(){if(library==null)return;library.removeAllViews();renderRow("Continuar jogando",true);renderRow("Explorar modpacks",false);if(cards.length()==0){TextView empty=text("Nenhum modpack publicado ainda. Quando houver releases no painel, elas aparecerão aqui.",16,Color.LTGRAY);empty.setPadding(0,dp(28),0,dp(28));library.addView(empty);}}
    private void renderRow(String title,boolean local){LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);int count=0;for(int i=0;i<cards.length();i++){try{JSONObject card=cards.getJSONObject(i);String current=installed(card.getString("id"));if(local!=(current!=null))continue;count++;LinearLayout tile=new LinearLayout(this);tile.setOrientation(LinearLayout.VERTICAL);tile.setPadding(dp(10),dp(10),dp(10),dp(14));tile.setBackgroundColor(Color.rgb(29,32,46));LinearLayout.LayoutParams layout=new LinearLayout.LayoutParams(dp(205),-2);layout.setMargins(0,0,dp(14),dp(12));row.addView(tile,layout);
                ImageView image=new ImageView(this);image.setScaleType(ImageView.ScaleType.CENTER_CROP);image.setBackgroundColor(Color.rgb(51,44,73));tile.addView(image,new LinearLayout.LayoutParams(-1,dp(130)));loadCover(card.optString("icon",""),image);
                TextView name=text(card.getString("name"),18,Color.WHITE);name.setPadding(0,dp(12),0,dp(7));tile.addView(name);JSONObject loader=card.getJSONObject("loader");tile.addView(text("Minecraft "+card.getString("minecraft")+" · "+loader.getString("type"),13,Color.rgb(155,164,189)));tile.addView(text(card.getInt("modCount")+" mods",13,Color.rgb(155,164,189)));
                boolean update=current!=null&&!current.equals(card.getString("releaseId"));String label=current==null?"Baixar":update?"Jogar · atualização disponível":"Jogar offline";Button play=button(label);tile.addView(play);play.setOnClickListener(v->{if(current==null)confirmInstall(card,false);else play(card);});
                if(update){Button download=button("Ver nova versão "+card.optString("version"));tile.addView(download);download.setOnClickListener(v->confirmInstall(card,true));}
                if(current!=null){Button rollback=button("Versão anterior");rollback.setTextSize(12);tile.addView(rollback);rollback.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("Voltar à versão anterior?").setMessage("A versão atual permanece salva. Os mundos de cada versão são mantidos separados.").setNegativeButton("Cancelar",null).setPositiveButton("Voltar",(d,w)->{try{installer.rollback(card.getString("id"));render();}catch(Exception e){status.setText(e.getMessage());}}).show());}
                tile.setOnLongClickListener(v->{manualReport(card);return true;});
            }catch(Exception ignored){}}
        if(count==0)return;TextView heading=text(title,21,Color.WHITE);heading.setPadding(0,dp(22),0,dp(14));library.addView(heading);HorizontalScrollView scroll=new HorizontalScrollView(this);scroll.setHorizontalScrollBarEnabled(false);scroll.addView(row);library.addView(scroll);
    }
    private void confirmInstall(JSONObject card,boolean updating){if(installing)return;try{new AlertDialog.Builder(this).setTitle(updating?"Atualizar modpack?":"Baixar modpack?").setMessage(card.getString("name")+"\nVersão "+card.getString("version")+"\n"+String.format(Locale.getDefault(),"%.1f MB",card.getLong("size")/1048576.0)+" de conteúdo, além dos componentes do Minecraft.\n\nA instalação atual continuará disponível se houver falha. Selecione uma conta local ou Microsoft em Conta / launcher antes da primeira instalação.").setNegativeButton("Cancelar",null).setPositiveButton(updating?"Atualizar":"Baixar",(d,w)->install(card)).show();}catch(Exception e){status.setText(e.getMessage());}}
    private void install(JSONObject card){installing=true;installer.cancelled=false;progress.setVisibility(android.view.View.VISIBLE);Button cancel=button("Cancelar instalação");library.addView(cancel,0);cancel.setOnClickListener(v->installer.cancelled=true);jobs.execute(()->{
        try{JSONObject manifest=installer.install(card,(message,done,total)->runOnUiThread(()->{status.setText(message);progress.setMax(Math.max(1,total));progress.setProgress(done);}));String current=installed(manifest.getString("projectId"));runOnUiThread(()->{status.setText(current!=null&&current.equals(manifest.optString("releaseId"))?"Instalado · pronto para jogar offline":"Conclua o instalador do loader e volte à biblioteca.");progress.setVisibility(android.view.View.GONE);render();});}
        catch(Exception error){runOnUiThread(()->{status.setText(error.getMessage());progress.setVisibility(android.view.View.GONE);render();});if(!installer.cancelled)Diagnostics.offer(this,api,jobs,"installation",error.toString(),android.util.Log.getStackTraceString(error),card.optString("id",null),card.optString("releaseId",null),()->{});}
        finally{installing=false;}
    });}
    private void play(JSONObject card){try{installer.selectInstalled(card.getString("id"));getSharedPreferences("studio",0).edit().putString("lastPlayedProject",card.getString("id")).apply();startActivity(new Intent(this,LauncherActivity.class));}catch(Exception error){status.setText(error.getMessage());}}
    private void loadCover(String raw,ImageView image){if(raw.isEmpty()||raw.equals("null"))return;images.execute(()->{try{String url=raw.startsWith("/")?api.absolute(raw):raw;String digest=hex(MessageDigest.getInstance("SHA-256").digest(url.getBytes("UTF-8")));File cache=new File(getFilesDir(),"studio-cover-"+digest);if(!cache.isFile()){
                URL target=new URL(url);HttpURLConnection conn=null;try{for(int i=0;i<6;i++){if(!target.getProtocol().equals("https"))throw new IOException("Ícone exige HTTPS");conn=(HttpURLConnection)target.openConnection();conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(10000);conn.setReadTimeout(15000);int code=conn.getResponseCode();if(code>=300&&code<400){String next=conn.getHeaderField("Location");conn.disconnect();if(next==null)throw new IOException("Ícone indisponível");target=new URL(target,next);continue;}if(code!=200)throw new IOException("Ícone indisponível");try(InputStream input=conn.getInputStream();OutputStream output=new FileOutputStream(cache)){int size=0,read;byte[] bytes=new byte[8192];while((read=input.read(bytes))!=-1){size+=read;if(size>2097152)throw new IOException("Ícone muito grande");output.write(bytes,0,read);}}break;}}catch(Exception e){cache.delete();throw e;}finally{if(conn!=null)conn.disconnect();}}
            android.graphics.Bitmap bitmap=BitmapFactory.decodeFile(cache.getPath());if(bitmap!=null)runOnUiThread(()->image.setImageBitmap(bitmap));
        }catch(Exception ignored){}});}
    private String hex(byte[] bytes){StringBuilder result=new StringBuilder();for(byte b:bytes)result.append(String.format("%02x",b&255));return result.toString();}
    private void checkGameCrash(){if(api==null)return;String project=getSharedPreferences("studio",0).getString("lastPlayedProject",null);if(project==null)return;String release=installed(project);if(release==null)return;jobs.execute(()->{try{File root=StudioInstaller.instance(project,release),folder=new File(root,"crash-reports");int exit=getSharedPreferences("studio",0).getInt("pendingGameExit",0);if(exit!=0){File logFile=new File(Tools.DIR_GAME_HOME,"latestlog.txt");String exitLog=logFile.isFile()?tail(logFile):"Java exit code: "+exit;Diagnostics.offer(this,api,jobs,"game-crash","Java exit code: "+exit,exitLog,project,release,()->getSharedPreferences("studio",0).edit().remove("pendingGameExit").putLong("gameCrash:"+project,System.currentTimeMillis()).apply());return;}File[] reports=folder.listFiles();if(reports==null)return;Arrays.sort(reports,(a,b)->Long.compare(b.lastModified(),a.lastModified()));if(reports.length==0)return;File latest=reports[0];long seen=getSharedPreferences("studio",0).getLong("gameCrash:"+project,0);if(latest.lastModified()<=seen)return;String log=tail(latest);long timestamp=latest.lastModified();Diagnostics.offer(this,api,jobs,"game-crash","Minecraft apresentou erro",log,project,release,()->getSharedPreferences("studio",0).edit().putLong("gameCrash:"+project,timestamp).apply());}catch(Exception ignored){}});}
    private String tail(File file) throws IOException {try(RandomAccessFile input=new RandomAccessFile(file,"r")){long start=Math.max(0,input.length()-524288);input.seek(start);byte[] bytes=new byte[(int)(input.length()-start)];input.readFully(bytes);return new String(bytes,"UTF-8");}}
    private void manualReport(JSONObject card){jobs.execute(()->{try{String project=card.getString("id"),release=installed(project);File log=new File(StudioInstaller.instance(project,release),"logs/latest.log");if(!log.isFile())log=new File(Tools.DIR_GAME_HOME,"latestlog.txt");String content=log.isFile()?tail(log):"Nenhum log disponível";Diagnostics.offer(this,api,jobs,"other","Relatório enviado pelo jogador",content,project,release,()->{});}catch(Exception e){runOnUiThread(()->status.setText("Nenhum relatório local disponível"));}});}
}
