package net.kdt.pojavlaunch.studio;

import android.app.*;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.text.Html;
import android.widget.*;
import org.json.*;
import java.net.URLEncoder;
import java.util.concurrent.*;

/** Provider-neutral discovery: credentials remain on the server. */
public final class StudioExploreActivity extends Activity {
    private StudioApi api;
    private final ExecutorService work=Executors.newSingleThreadExecutor();
    private LinearLayout results;
    private TextView status;
    private EditText query,minecraft;
    private Spinner source,loader,sort,category;
    private String[] categoryIds={""};
    private String cursor=null,lastQuery="";
    private volatile boolean busy;
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density);}
    private TextView text(String value,int size){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(Color.rgb(233,226,249));t.setPadding(0,dp(7),0,dp(7));return t;}
    private Button button(String label){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(Color.WHITE);GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(111,60,174));bg.setCornerRadius(dp(12));b.setBackground(bg);b.setPadding(dp(12),dp(8),dp(12),dp(8));return b;}
    private EditText field(String hint){EditText e=new EditText(this);e.setSingleLine(true);e.setHint(hint);e.setTextColor(Color.WHITE);e.setHintTextColor(Color.rgb(173,160,196));return e;}
    private Spinner spinner(String[] labels){Spinner s=new Spinner(this);s.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));return s;}
    @Override public void onCreate(Bundle state){super.onCreate(state);try{api=new StudioApi(this);}catch(Exception error){finish();return;}
        LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setPadding(dp(20),dp(15),dp(20),dp(12));root.setBackgroundColor(Color.rgb(18,13,29));
        root.addView(text("Explorar modpacks",28));root.addView(text("Escolha sua próxima aventura. Sua biblioteca é pessoal.",14));
        query=field("Pesquisar: Cobblemon, Pixelmon...");root.addView(query);
        source=spinner(new String[]{"Todas as fontes","Modrinth","CurseForge"});loader=spinner(new String[]{"Todos os loaders","Fabric","Forge","NeoForge","Quilt"});sort=spinner(new String[]{"Populares","Atualizados","Relevância","Novos"});
        LinearLayout filters=new LinearLayout(this);filters.addView(source,new LinearLayout.LayoutParams(0,-2,1));filters.addView(loader,new LinearLayout.LayoutParams(0,-2,1));root.addView(filters);
        LinearLayout more=new LinearLayout(this);minecraft=field("Minecraft: todas");more.addView(minecraft,new LinearLayout.LayoutParams(0,-2,1));more.addView(sort,new LinearLayout.LayoutParams(0,-2,1));root.addView(more);category=spinner(new String[]{"Todas as categorias"});root.addView(category);
        Button search=button("Pesquisar");root.addView(search);search.setOnClickListener(v->search(true));
        status=text("Buscando modpacks...",13);root.addView(status);ScrollView scroll=new ScrollView(this);results=new LinearLayout(this);results.setOrientation(1);scroll.addView(results);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);search(true);work.execute(()->{try{JSONArray categories=api.get("/api/v1/public/discover/categories").getJSONArray("items");String[] labels=new String[categories.length()+1],ids=new String[labels.length];labels[0]="Todas as categorias";ids[0]="";for(int i=0;i<categories.length();i++){JSONObject c=categories.getJSONObject(i);labels[i+1]=c.getString("name")+" · "+c.getString("provider");ids[i+1]=c.getString("provider")+":"+c.getString("id");}runOnUiThread(()->{categoryIds=ids;category.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));});}catch(Exception ignored){}});
    }
    private String enc(String s)throws Exception{return URLEncoder.encode(s,"UTF-8");}
    private void search(boolean reset){if(busy)return;busy=true;status.setText("Consultando as origens...");
        final String searchText=query.getText().toString().trim(),mc=minecraft.getText().toString().trim();final int providerIndex=source.getSelectedItemPosition(),loaderIndex=loader.getSelectedItemPosition(),sortIndex=sort.getSelectedItemPosition();
        final String categoryId=categoryIds[Math.max(0,Math.min(category.getSelectedItemPosition(),categoryIds.length-1))];
        work.execute(()->{try{
        if(reset){cursor=null;lastQuery="query="+enc(searchText)+"&provider="+new String[]{"all","modrinth","curseforge"}[providerIndex]+"&sort="+new String[]{"popular","updated","relevance","newest"}[sortIndex]+"&limit=12";
            if(!mc.isEmpty())lastQuery+="&minecraft="+enc(mc);if(loaderIndex>0)lastQuery+="&loader="+new String[]{"","fabric","forge","neoforge","quilt"}[loaderIndex];if(!categoryId.isEmpty())lastQuery+="&category="+enc(categoryId);}
        JSONObject page=api.get("/api/v1/public/discover/modpacks?"+lastQuery+(cursor==null?"":"&cursor="+enc(cursor)));cursor=page.isNull("nextCursor")?null:page.getString("nextCursor");JSONArray items=page.getJSONArray("items");
        runOnUiThread(()->{if(reset)results.removeAllViews();else if(results.getChildCount()>0&&results.getChildAt(results.getChildCount()-1) instanceof Button)results.removeViewAt(results.getChildCount()-1);
            for(int i=0;i<items.length();i++)try{add(items.getJSONObject(i));}catch(Exception ignored){}status.setText(items.length()==0?"Nenhum resultado para esses filtros.":"Escolha um modpack para ver detalhes e versões.");
            JSONArray issues=page.optJSONArray("issues");if(issues!=null&&issues.length()>0)try{status.append("\n"+issues.getJSONObject(0).optString("message"));}catch(Exception ignored){}
            if(cursor!=null){Button next=button("Carregar mais");results.addView(next);next.setOnClickListener(v->search(false));}});
        }catch(Exception error){runOnUiThread(()->status.setText("Não foi possível pesquisar. Verifique sua conexão."));}finally{busy=false;}});
    }
    private void add(JSONObject item)throws Exception{
        ImageView cover=new ImageView(this);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);StudioCovers.load(this,item.optString("icon"),cover);
        LinearLayout tile=new LinearLayout(this);tile.setOrientation(1);tile.setPadding(dp(16),dp(12),dp(16),dp(15));GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(35,25,52));bg.setCornerRadius(dp(16));tile.setBackground(bg);LinearLayout.LayoutParams layout=new LinearLayout.LayoutParams(-1,-2);layout.setMargins(0,dp(12),0,dp(4));results.addView(tile,layout);
        tile.addView(text(item.getString("name"),21));tile.addView(text(item.optString("summary"),14));tile.addView(text(item.optString("provider")+" · "+item.optLong("downloads")+" downloads",12));tile.addView(text("Minecraft "+join(item.optJSONArray("minecraftVersions"))+" · "+join(item.optJSONArray("loaders")),12));
        tile.addView(cover,0,new LinearLayout.LayoutParams(-1,dp(140)));Button view=button("Ver modpack e versões");tile.addView(view);view.setOnClickListener(v->details(item));
    }
    private String join(JSONArray items){if(items==null)return "";StringBuilder s=new StringBuilder();for(int i=0;i<Math.min(4,items.length());i++){if(i>0)s.append(", ");s.append(items.optString(i));}return s.toString();}
    private void details(JSONObject item){if(busy)return;busy=true;status.setText("Abrindo detalhes...");final String mc=minecraft.getText().toString().trim();final int chosenLoader=loader.getSelectedItemPosition();work.execute(()->{try{
        String path="/api/v1/public/discover/"+item.getString("provider")+"/"+item.getString("externalProjectId");String filter="";if(!mc.isEmpty())filter+="&minecraft="+enc(mc);if(chosenLoader>0)filter+="&loader="+new String[]{"","fabric","forge","neoforge","quilt"}[chosenLoader];JSONObject detail=api.get(path);JSONArray versions=api.get(path+"/versions"+(filter.isEmpty()?"":"?"+filter.substring(1))).getJSONArray("items");
        runOnUiThread(()->{try{
            LinearLayout content=new LinearLayout(this);content.setOrientation(1);content.setPadding(dp(16),dp(8),dp(16),dp(12));content.addView(text(detail.getString("name"),24));content.addView(text("Por "+join(detail.optJSONArray("authors")),13));
            String description=detail.optString("description");TextView body=text(description,14);if("html".equals(detail.optString("descriptionFormat")))body.setText(Html.fromHtml(description,Html.FROM_HTML_MODE_LEGACY));content.addView(body);
            if(versions.length()==0){new AlertDialog.Builder(this).setTitle("Sem versões disponíveis").setView(content).setPositiveButton("Fechar",null).show();return;}
            String[] labels=new String[versions.length()];for(int i=0;i<labels.length;i++){JSONObject version=versions.getJSONObject(i);labels[i]=version.getString("name")+" · Minecraft "+join(version.optJSONArray("minecraftVersions"))+" · "+join(version.optJSONArray("loaders"));}
            Spinner select=spinner(labels);content.addView(text("Versão do modpack",15));content.addView(select);content.addView(text("Uso pessoal. Os downloads respeitam as permissões dos autores. O perfil pode ser usado offline após instalado.",12));ScrollView scroll=new ScrollView(this);scroll.addView(content);
            new AlertDialog.Builder(this).setTitle("Adicionar à minha biblioteca").setView(scroll).setNegativeButton("Cancelar",null).setNeutralButton("Abrir na origem",(d,w)->{try{Uri uri=Uri.parse(detail.getString("websiteUrl"));if("https".equals(uri.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}}).setPositiveButton("Adicionar versão",(d,w)->{try{choose(detail,versions.getJSONObject(select.getSelectedItemPosition()));}catch(Exception ignored){}}).show();
        }catch(Exception error){status.setText("Detalhes indisponíveis");}});
    }catch(Exception error){runOnUiThread(()->status.setText("Falha ao buscar versões na origem."));}finally{busy=false;}});}
    private void choose(JSONObject detail,JSONObject version){if(busy)return;busy=true;status.setText("Preparando seu modpack...");work.execute(()->{try{StudioAccount.ensure(this,api);
        api.post("/api/v1/player/profiles",new JSONObject().put("provider",detail.getString("provider")).put("projectId",detail.getString("externalProjectId")).put("versionId",version.getString("id")));
        runOnUiThread(()->{Toast.makeText(this,"Adicionado. A preparação aparece na sua biblioteca.",Toast.LENGTH_LONG).show();finish();});
    }catch(Exception error){runOnUiThread(()->status.setText("Não foi possível adicionar: "+error.getMessage()));}finally{busy=false;}});}
    @Override protected void onDestroy(){work.shutdownNow();super.onDestroy();}
}
