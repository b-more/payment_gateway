package com.zcs.zcssdkdemo;

import android.os.Bundle;
import android.os.SystemClock;
import androidx.annotation.Nullable;
import androidx.appcompat.app.ActionBar;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import com.zcs.sdk.DriverManager;
import com.zcs.sdk.HQrsanner;

public class ScannerActivity extends BaseActivity implements View.OnClickListener {

    private Button mScannerPowerOnButton;
    private Button mOpenScannerButton;
    private Button mCloseScannerButton;
    private Button mScannerPowerOffButton;
    private EditText mResultTextView;

    private HQrsanner mhqscanner;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_scanner);
        mhqscanner = DriverManager.getInstance().getHQrsannerDriver();
        initView();
    }

    private void initView() {
        ActionBar actionBar = getSupportActionBar();
        if (actionBar != null) {
            actionBar.setTitle(getString(R.string.pref_others_scanner_key));
            actionBar.setDisplayHomeAsUpEnabled(true);
        }
        mScannerPowerOnButton = (Button) findViewById(R.id.btn_scanner_poweron);
        mScannerPowerOnButton.setOnClickListener(this);
        mOpenScannerButton = (Button) findViewById(R.id.btn_open_scanner);
        mOpenScannerButton.setOnClickListener(this);
        mCloseScannerButton = (Button) findViewById(R.id.btn_close_scanner);
        mCloseScannerButton.setOnClickListener(this);
        mScannerPowerOffButton = (Button) findViewById(R.id.btn_scanner_poweroff);
        mScannerPowerOffButton.setOnClickListener(this);
        mResultTextView = (EditText) findViewById(R.id.textview_result);
        mResultTextView.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView textView, int i, KeyEvent keyEvent) {
                //need to close.
                closeScanner();
                return false;
            }
        });
    }

    @Override
    public void onClick(View view) {
        int id = view.getId();
        if(id == R.id.btn_scanner_poweron) {
            scannerPowerOn();
        } else if (id == R.id.btn_open_scanner) {
            openScanner();
            //request focus for edittext
            mResultTextView.requestFocus();
        } else if (id == R.id.btn_close_scanner) {
            closeScanner();
        } else if (id == R.id.btn_scanner_poweroff) {
            scannerPowerOff();
        }
    }

    private void scannerPowerOn() {
        mhqscanner.QRScanerCtrl((byte)1);
        mhqscanner.QRScanerPowerCtrl((byte)0);
        SystemClock.sleep(10);
        mhqscanner.QRScanerPowerCtrl((byte)1);
    }

    private void openScanner() {
        mhqscanner.QRScanerCtrl((byte)1);
        SystemClock.sleep(10);
        mhqscanner.QRScanerCtrl((byte)0);
    }

    private void closeScanner() {
        mhqscanner.QRScanerCtrl((byte)1);
    }

    private void scannerPowerOff() {
        mhqscanner.QRScanerPowerCtrl((byte)0);
    }
}
