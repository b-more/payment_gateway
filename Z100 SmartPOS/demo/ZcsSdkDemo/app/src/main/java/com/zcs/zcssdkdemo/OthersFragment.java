package com.zcs.zcssdkdemo;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.preference.ListPreference;
import android.preference.Preference;
import android.preference.PreferenceFragment;
import android.view.View;
import android.widget.Toast;

import androidx.annotation.Nullable;

import com.zcs.sdk.Beeper;
import com.zcs.sdk.DriverManager;
import com.zcs.sdk.Led;
import com.zcs.sdk.LedLightModeEnum;
import com.zcs.sdk.Printer;
import com.zcs.sdk.Sys;
import com.zcs.sdk.pin.pinpad.PinPadManager;
import com.zcs.zcssdkdemo.utils.BitmapUtils;

import java.util.concurrent.ExecutorService;

public class OthersFragment extends PreferenceFragment {

    private static final String KEY_LED = "others_led_key";
    private static final String KEY_BEEPER = "others_beeper_key";
    private static final String KEY_LCD = "others_lcd_key";
    private static final String KEY_CASHDRAWER = "others_cashdrawer_key";
    private static final String KEY_SCANNER = "others_scanner_key";
    private static final String KEY_SECONDARY_SCREEN_SHOW_IMAGE = "pref_others_second_screen_show_image_key";
    private static final String KEY_SECONDARY_SCREEN_SHOW_PINPAD = "pref_others_second_screen_show_pinpad_key";
    private DriverManager mDriverManager;
    private Sys mSys;
    private ExecutorService mSingleThreadExecutor;
    private PinPadManager mPinPadManager;

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        addPreferencesFromResource(R.xml.pref_others);
        mDriverManager = DriverManager.getInstance();
        mSys = mDriverManager.getBaseSysDevice();
        mSingleThreadExecutor = mDriverManager.getSingleThreadExecutor();
        mPinPadManager = mDriverManager.getPadManager();
    }

    @Override
    public void onStop() {
        super.onStop();
        if(mSys != null) {
            mSingleThreadExecutor.execute(new Runnable() {
                @Override
                public void run() {
                    mSys.showLcdMainScreen();
                }
            });
        }
    }

    @Override
    public void onViewCreated(View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        findPreference(KEY_LED).setOnPreferenceChangeListener(new Preference.OnPreferenceChangeListener() {
            @Override
            public boolean onPreferenceChange(Preference preference, Object newValue) {
                final Led led = mDriverManager.getLedDriver();
                ListPreference listPreference = (ListPreference) preference;
                final int index = listPreference.findIndexOfValue((String) newValue);
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        led.setLed(LedLightModeEnum.ALL, false);
                        if (index == 0) {
                            led.setLed(LedLightModeEnum.RED, true);
                        } else if (index == 1) {
                            led.setLed(LedLightModeEnum.GREEN, true);
                        } else if (index == 2) {
                            led.setLed(LedLightModeEnum.YELLOW, true);
                        } else if (index == 3) {
                            led.setLed(LedLightModeEnum.BLUE, true);
                        } else if (index == 4) {
                            led.setLed(LedLightModeEnum.ALL, true);
                        }
                    }
                }).start();
                return true;
            }
        });

        findPreference(KEY_BEEPER).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                final Beeper beeper = mDriverManager.getBeeper();
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        int ret = beeper.beep(4000, 600);
                    }
                }).start();
                return true;
            }
        });

        findPreference(KEY_LCD).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                testLcdBitmap();
                //testLcdString();
                return true;
            }
        });

        findPreference(KEY_CASHDRAWER).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                Printer printer = mDriverManager.getPrinter();
                printer.openBox();
                return true;
            }
        });

        findPreference(KEY_SCANNER).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                startScannerActivity();
                return true;
            }
        });

        findPreference(KEY_SECONDARY_SCREEN_SHOW_IMAGE).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                showBitmapOnSecondaryScreen();
                return true;
            }
        });

        findPreference(KEY_SECONDARY_SCREEN_SHOW_PINPAD).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                showPinpadOnSecondaryScreen();
                return true;
            }
        });

    }

    private void testLcdBitmap() {
        final Bitmap bitmap = BitmapUtils.stringToBitmapForLCD("Welcome",128,56);
        mSingleThreadExecutor.execute(new Runnable() {
            @Override
            public void run() {
                mSys.showBitmapOnLcd(bitmap, true);
                bitmap.recycle();
            }
        });
    }

    private void testLcdString() {
//        Sys sys = mDriverManager.getBaseSysDevice();
//        String toShow = "Welcome to zcs pos lcd screen.";
//        sys.showStringOnLcd(0, 0, toShow, true);
        mSingleThreadExecutor.execute(new Runnable() {
            @Override
            public void run() {
                String toShow = "Welcome to zcs pos lcd screen.";
                mSys.showStringOnLcd(0, 0, toShow, true);
            }
        });
    }

    private void startScannerActivity() {
        startActivity(new Intent(getActivity(), ScannerActivity.class));
    }

    private void showBitmapOnSecondaryScreen() {
        final Bitmap bitmap = BitmapFactory.decodeResource(getActivity().getResources(), R.drawable.test_secondary_screen2);
        mSingleThreadExecutor.execute(new Runnable() {
            @Override
            public void run() {
                mSys.showBitmapOnSecondaryScreen(bitmap, true);
                bitmap.recycle();

                //or use showJpgOnSecondScreen to set the image with file path
//                try {
//                    FileUtils.doCopy(getActivity(), "secondscreen", getActivity().getFilesDir().getPath() + "/secondscreen/");
//                } catch (IOException e) {
//                    e.printStackTrace();
//                }
//                mSys.showJpgOnSecondScreen(getActivity().getFilesDir().getPath() + "/secondscreen/test_secondary_screen2.jpg");
            }
        });
    }

    private void showPinpadOnSecondaryScreen() {
        mPinPadManager.startSecondaryScreenInputPinKey(4, 12, 60 * 1000,
                new PinPadManager.OnPinKeyInputListener() {
                    @Override
                    public void onKeyPress(byte b) {
                        Toast.makeText(getActivity(), "User click key: " + (char)b, Toast.LENGTH_SHORT).show();
                    }

                    @Override
                    public void onConfirmKeyPress() {
                        Toast.makeText(getActivity(), "User click confirm key", Toast.LENGTH_SHORT).show();
                    }

                    @Override
                    public void onCancelKeyPress() {
                        Toast.makeText(getActivity(), "User click cancel key", Toast.LENGTH_SHORT).show();
                    }

                    @Override
                    public void onDeleteKeyPress() {
                        Toast.makeText(getActivity(), "User click delete key", Toast.LENGTH_SHORT).show();
                    }
                });
    }

}
