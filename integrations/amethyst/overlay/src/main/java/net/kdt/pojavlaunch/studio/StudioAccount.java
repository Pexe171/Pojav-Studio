package net.kdt.pojavlaunch.studio;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.KeyStore;

/** Player sessions are encrypted with the application's Android Keystore key. */
final class StudioAccount {
    private static final String ALIAS="studio-player-session";
    private static SecretKey key()throws Exception{
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return generator.generateKey();
    }
    static JSONObject read(Context context){
        try{File file=new File(context.getFilesDir(),"studio-player-session.json");if(!file.isFile()||file.length()>16384)return new JSONObject();
            JSONObject envelope=new JSONObject(new String(Files.readAllBytes(file.toPath()),StandardCharsets.UTF_8));Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(envelope.getString("iv"),Base64.NO_WRAP)));
            return new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8));
        }catch(Exception unavailable){return new JSONObject();}
    }
    static String token(Context context){return read(context).optString("token","");}
    static void save(Context context,JSONObject session)throws Exception{
        if(!session.getString("token").matches("[A-Za-z0-9_-]{43}"))throw new IOException("Sessão inválida");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        JSONObject envelope=new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).put("data",Base64.encodeToString(cipher.doFinal(session.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
        Path temp=Files.createTempFile(context.getFilesDir().toPath(),".player-",".tmp");try{Files.write(temp,envelope.toString().getBytes(StandardCharsets.UTF_8));Files.move(temp,new File(context.getFilesDir(),"studio-player-session.json").toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}finally{Files.deleteIfExists(temp);}
    }
    static void clear(Context context){new File(context.getFilesDir(),"studio-player-session.json").delete();}
    static synchronized void ensure(Context context,StudioApi api)throws Exception{if(token(context).isEmpty())save(context,api.post("/api/v1/player/auth/guest",new JSONObject()));}
}
