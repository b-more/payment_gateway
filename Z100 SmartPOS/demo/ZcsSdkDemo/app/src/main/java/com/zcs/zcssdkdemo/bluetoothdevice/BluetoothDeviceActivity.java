package com.zcs.zcssdkdemo.bluetoothdevice;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import android.view.MenuItem;
import android.widget.Toast;

import com.zcs.zcssdkdemo.R;

public class BluetoothDeviceActivity extends AppCompatActivity  {

    private ActionBar actionBar;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        actionBar = getSupportActionBar();
        if (actionBar != null) {
            actionBar.setTitle(getString(R.string.demo_title));
        }
        BluetoothDeviceFragment  fragment = new BluetoothDeviceFragment();
        if (savedInstanceState == null)
            getFragmentManager().beginTransaction().add(R.id.frame_container, fragment).commit();

        requestBluetoothPermission();
    }

    private static final int REQUEST_CODE = 1;
    private void requestBluetoothPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.ACCESS_COARSE_LOCATION},
                    REQUEST_CODE);
        } else {
            //do nothing
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                //do nothing
            } else {
                Toast.makeText(BluetoothDeviceActivity.this, "Cannot connect bluetooth device without ACCESS_COARSE_LOCATION permission", Toast.LENGTH_SHORT).show();;
            }
        }
    }

    @Override
    public void onBackPressed() {
        super.onBackPressed();
        if (getFragmentManager().getBackStackEntryCount() <= 1) {
            if (actionBar != null) {
                actionBar.setTitle(getString(R.string.demo_title));
                actionBar.setDisplayHomeAsUpEnabled(false);
            }
        }
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == android.R.id.home) {
            this.onBackPressed();
        }
        return super.onOptionsItemSelected(item);
    }
}
