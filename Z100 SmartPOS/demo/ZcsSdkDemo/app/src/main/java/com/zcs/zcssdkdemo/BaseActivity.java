package com.zcs.zcssdkdemo;

import androidx.appcompat.app.AppCompatActivity;
import android.view.MenuItem;

/**
 * Created by yyzz on 19.7.11.
 */
public abstract class BaseActivity extends AppCompatActivity {

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == android.R.id.home) {
            this.onBackPressed();
        }
        return super.onOptionsItemSelected(item);
    }
}
