package net.kdt.pojavlaunch.studio;
import android.app.Activity;
import android.graphics.BitmapFactory;
import android.widget.ImageView;
import java.net.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.concurrent.*;
final class StudioCovers {
    private static final ExecutorService work=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(48),new ThreadPoolExecutor.DiscardPolicy());
    static void load(Activity activity,String raw,ImageView image){if(raw==null||!raw.startsWith("https://"))return;work.execute(()->{File cache=null;try{
        StringBuilder key=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(raw.getBytes("UTF-8")))key.append(String.format("%02x",b&255));cache=new File(activity.getCacheDir(),"studio-icon-"+key);
        if(!cache.isFile()){HttpURLConnection conn=(HttpURLConnection)new URL(raw).openConnection();conn.setConnectTimeout(5000);conn.setReadTimeout(5000);conn.setInstanceFollowRedirects(false);try{if(conn.getResponseCode()!=200)return;try(InputStream input=conn.getInputStream();OutputStream output=new FileOutputStream(cache)){byte[] bytes=new byte[8192];int total=0,n;while((n=input.read(bytes))!=-1){total+=n;if(total>2097152)throw new IOException("Icon too large");output.write(bytes,0,n);}}}finally{conn.disconnect();}}
        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeFile(cache.getPath(),bounds);if(bounds.outWidth<=0||bounds.outHeight<=0)return;
        BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=1;while(bounds.outWidth/options.inSampleSize>512||bounds.outHeight/options.inSampleSize>512)options.inSampleSize*=2;
        android.graphics.Bitmap bitmap=BitmapFactory.decodeFile(cache.getPath(),options);if(bitmap!=null)activity.runOnUiThread(()->{if(!activity.isDestroyed())image.setImageBitmap(bitmap);});
    }catch(Exception ignored){if(cache!=null)cache.delete();}});}
}
