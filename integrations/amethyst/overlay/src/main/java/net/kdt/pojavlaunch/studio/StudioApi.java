package net.kdt.pojavlaunch.studio;

import android.content.Context;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public final class StudioApi {
    public final String base;
    public final String name;
    public StudioApi(Context context) throws Exception {
        JSONObject config=new JSONObject(read(context.getAssets().open("studio-config.json"),65536));
        base=config.getString("apiUrl").replaceAll("/$",""); name=config.getString("name");
        if(!base.startsWith("https://")) throw new IOException("A API do launcher deve usar HTTPS");
    }
    public String absolute(String endpoint) throws Exception {
        if(!endpoint.startsWith("/api/v1/") || endpoint.contains("..")) throw new IOException("Endpoint inválido");
        return base+endpoint;
    }
    public JSONObject get(String endpoint) throws Exception {return request(endpoint,null);}
    public JSONObject getFast(String endpoint) throws Exception {return request(endpoint,null,4000);}
    public JSONObject post(String endpoint,JSONObject body) throws Exception {return request(endpoint,body);}
    private JSONObject request(String endpoint,JSONObject body) throws Exception {
        return request(endpoint,body,30000);
    }
    private JSONObject request(String endpoint,JSONObject body,int timeout) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL(absolute(endpoint)).openConnection();
        connection.setConnectTimeout(Math.min(20000,timeout));connection.setReadTimeout(timeout);connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept","application/json");
        try {
            if(body!=null){connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json; charset=utf-8");connection.setRequestProperty("x-studio-request","1");try(OutputStream output=connection.getOutputStream()){output.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
            int status=connection.getResponseCode();
            if(status<200||status>=300)throw new IOException("API indisponível: HTTP "+status);
            return new JSONObject(read(connection.getInputStream(),2097152));
        } finally { connection.disconnect(); }
    }
    public static String read(InputStream input,int max) throws IOException {
        try(InputStream stream=input;ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192];int size=0,count;
            while((count=stream.read(buffer))!=-1){size+=count;if(size>max)throw new IOException("Resposta excede o limite");output.write(buffer,0,count);}
            return new String(output.toByteArray(),StandardCharsets.UTF_8);
        }
    }
}
