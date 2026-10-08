package net.kdt.pojavlaunch.studio;

import android.app.Activity;
import android.content.Context;
import android.hardware.input.InputManager;
import android.view.InputDevice;
import android.view.View;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleEventObserver;
import androidx.lifecycle.LifecycleOwner;

/** Only physical alphabetic keyboards hide touch controls. Gamepads and virtual IMEs do not. */
public final class KeyboardControls implements InputManager.InputDeviceListener {
    private final Activity activity;
    private final View controls, menu;
    private final InputManager inputs;
    private int savedVisibility = View.VISIBLE;
    private boolean hidden = false;
    public KeyboardControls(Activity activity, View controls, View menu) {
        this.activity=activity; this.controls=controls; this.menu=menu;
        inputs=(InputManager)activity.getSystemService(Context.INPUT_SERVICE);
        inputs.registerInputDeviceListener(this,null);
        if(activity instanceof LifecycleOwner) ((LifecycleOwner)activity).getLifecycle().addObserver((LifecycleEventObserver)(owner,event)->{
            if(event==Lifecycle.Event.ON_RESUME)refresh();
            if(event==Lifecycle.Event.ON_DESTROY)inputs.unregisterInputDeviceListener(this);
        });
        controls.post(this::refresh);
    }
    public static boolean hasPhysicalKeyboard() {
        for(int id:InputDevice.getDeviceIds()) {
            InputDevice device=InputDevice.getDevice(id);
            if(device!=null && !device.isVirtual() && device.getKeyboardType()==InputDevice.KEYBOARD_TYPE_ALPHABETIC && (device.getSources() & InputDevice.SOURCE_KEYBOARD)==InputDevice.SOURCE_KEYBOARD) return true;
        }
        return false;
    }
    public void refresh() {
        String mode=activity.getSharedPreferences("studio",Context.MODE_PRIVATE).getString("touchMode","auto");
        boolean hide="hide".equals(mode) || "auto".equals(mode) && hasPhysicalKeyboard();
        if(hide && !hidden) { savedVisibility=controls.getVisibility(); controls.setVisibility(View.GONE); hidden=true; }
        else if(!hide && hidden) { controls.setVisibility(savedVisibility); hidden=false; }
        if(hide) menu.setVisibility(View.VISIBLE);
    }
    @Override public void onInputDeviceAdded(int id){refresh();}
    @Override public void onInputDeviceRemoved(int id){refresh();}
    @Override public void onInputDeviceChanged(int id){refresh();}
}
