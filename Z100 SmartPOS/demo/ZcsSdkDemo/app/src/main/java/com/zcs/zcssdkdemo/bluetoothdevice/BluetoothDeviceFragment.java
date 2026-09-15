package com.zcs.zcssdkdemo.bluetoothdevice;

import android.app.Activity;
import android.app.Dialog;
import android.app.Fragment;
import android.app.ProgressDialog;
import android.bluetooth.BluetoothDevice;
import android.content.DialogInterface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.preference.Preference;
import android.preference.PreferenceFragment;
import android.util.Log;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ListView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AlertDialog;

import com.zcs.sdk.ConnectTypeEnum;
import com.zcs.sdk.DriverManager;
import com.zcs.sdk.SdkResult;
import com.zcs.sdk.Sys;
import com.zcs.sdk.bluetooth.BluetoothListener;
import com.zcs.sdk.bluetooth.BluetoothManager;
import com.zcs.sdk.bluetooth.emv.CardDetectedEnum;
import com.zcs.sdk.bluetooth.emv.EmvStatusEnum;
import com.zcs.sdk.bluetooth.emv.OnBluetoothEmvListener;
import com.zcs.sdk.card.CardSlotNoEnum;
import com.zcs.sdk.card.ICCard;
import com.zcs.sdk.util.StringUtils;
import com.zcs.zcssdkdemo.CardFragment;
import com.zcs.zcssdkdemo.InfoFragment;
import com.zcs.zcssdkdemo.R;
import com.zcs.zcssdkdemo.utils.DialogUtils;
import com.zcs.zcssdkdemo.utils.SDK_Result;

import java.io.File;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BluetoothDeviceFragment extends PreferenceFragment {

    private final static String TAG = "BluetoothDeviceFragment";

    private final static String BLUETOOTH_DEVICE_CONNECT_KEY = "bluetooth_device_connect_key";
    private final static String BLUETOOTH_DEVICE_SYSTEM_INFO_KEY = "bluetooth_device_system_info_key";
    private final static String BLUETOOTH_DEVICE_SEARCH_CARD_KEY = "bluetooth_device_search_card_key";
    private final static String BLUETOOTH_DEVICE_LISTEN_CARD_KEY = "bluetooth_device_listen_card_key";
    private final static String BLUETOOTH_DEVICE_VERIFY_KEY = "bluetooth_device_verify_key";
    private final static String BLUETOOTH_DEVICE_MODIFY_KEY = "bluetooth_device_modify_key";
    private final static String BLUETOOTH_DEVICE_UPDATE_FIRMWARE_KEY = "bluetooth_device_update_firmware";
    private final static String BLUETOOTH_DEVICE_POWER_OFF_KEY = "bluetooth_device_power_off";
    private final static String BLUETOOTH_DEVICE_SET_SCP03_KEY_KEY = "bluetooth_device_custom_set_SCP03_key";

    private DriverManager mDriverManager;;
    private BluetoothManager mBluetoothManager;
    private Sys mSys;

    private Activity mActivity;
    private ListView mListView;
    private Dialog mDialog;
    private LeDeviceListAdapter mAdapter;

    private final static int MSG_CONNECT_FAILED = 1000;
    private final static int MSG_CONNECT_SUCCESS = 1001;
    private final static int MSG_INIT_RESULT = 1002;
    private Handler mHandler = new Handler(Looper.getMainLooper()) {
        @Override
        public void handleMessage(Message msg) {
            Log.d(TAG, "handleMessage msg = " + msg.what);
            switch (msg.what) {
                case MSG_CONNECT_FAILED:
                    Toast.makeText(mActivity, "Connect failed", Toast.LENGTH_SHORT).show();
                    break;
                case MSG_CONNECT_SUCCESS:
                    mAdapter.clear();
                    mDialog.dismiss();
                    Toast.makeText(mActivity, "Connect success", Toast.LENGTH_SHORT).show();
                    break;
                case MSG_INIT_RESULT:
                    Toast.makeText(mActivity, (CharSequence) msg.obj, Toast.LENGTH_SHORT).show();
                    break;
                default:
            }
        }
    };

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        addPreferencesFromResource(R.xml.pref_bluetooth_device_main);
        mActivity = getActivity();
        initSdk();
        initBluetoothDeviceDialog();
    }

    @Override
    public void onStop() {
//        mBluetoothManager.close();
        if (mHandler != null) {
            mHandler.removeCallbacksAndMessages(null);
            //mHandler = null;
        }
        super.onStop();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        mBluetoothManager.close();
    }

    @Override
    public void onViewCreated(View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        findPreference(BLUETOOTH_DEVICE_CONNECT_KEY).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                if (mBluetoothManager.isConnected()) {
                    mBluetoothManager.close();
                    Toast.makeText(mActivity, "Disconnect", Toast.LENGTH_SHORT).show();
                }
                discovery();
                return true;
            }
        });

        findPreference(BLUETOOTH_DEVICE_SYSTEM_INFO_KEY).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                if (!mBluetoothManager.isConnected()) {
                    Toast.makeText(mActivity, "Bluetooth is not connected", Toast.LENGTH_SHORT).show();
                    return true;
                }
                switchFragment(BluetoothDeviceFragment.this, new InfoFragment(), mActivity.getString(R.string.pref_device_info));
                return true;
            }
        });

        findPreference(BLUETOOTH_DEVICE_SEARCH_CARD_KEY).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                if (!mBluetoothManager.isConnected()) {
                    Toast.makeText(mActivity, "Bluetooth is not connected", Toast.LENGTH_SHORT).show();
                    return true;
                }
                switchFragment(BluetoothDeviceFragment.this, new CardFragment(), mActivity.getString(R.string.pref_card));
                return true;
            }
        });

        findPreference(BLUETOOTH_DEVICE_LISTEN_CARD_KEY).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                if (!mBluetoothManager.isConnected()) {
                    Toast.makeText(mActivity, "Bluetooth is not connected", Toast.LENGTH_SHORT).show();
                    return true;
                }

                if(mBluetoothManager.getEmvListener() == null) {
                    mBluetoothManager.setEmvListener(mOnBluetoothEmvListenner);
                }
                return true;
            }
        });

        findPreference(BLUETOOTH_DEVICE_VERIFY_KEY).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                if (!mBluetoothManager.isConnected()) {
                    Toast.makeText(mActivity, "Bluetooth is not connected", Toast.LENGTH_SHORT).show();
                    return true;
                }
                //if verify failed, cannot read card
                byte[] key = new byte[64];
                Arrays.fill(key, (byte) 0xFF);
                int ret = mSys.verifyCustomerKey(key);
                if(ret == SdkResult.SDK_OK) {
                    Toast.makeText(mActivity, "Verify key success", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(mActivity, "Verify key failed ret = " + ret, Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        findPreference(BLUETOOTH_DEVICE_MODIFY_KEY).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                if (!mBluetoothManager.isConnected()) {
                    Toast.makeText(mActivity, "Bluetooth is not connected", Toast.LENGTH_SHORT).show();
                    return true;
                }
                //set this key for test
                byte[] oldKey = new byte[64];
                Arrays.fill(oldKey, (byte) 0xFF);
                byte[] newKey = new byte[64];
                Arrays.fill(newKey, (byte) 0xFF);
                int ret = mSys.modifyCustomerKey(oldKey, newKey);
                if(ret == SdkResult.SDK_OK) {
                    Toast.makeText(mActivity, "Modify key success", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(mActivity, "Modify key failed ret = " + ret, Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        findPreference(BLUETOOTH_DEVICE_UPDATE_FIRMWARE_KEY).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                if (!mBluetoothManager.isConnected()) {
                    Toast.makeText(mActivity, "Bluetooth is not connected", Toast.LENGTH_SHORT).show();
                    return true;
                }
                updateFirmware("/sdcard/update.bin");
                return true;
            }
        });

        findPreference(BLUETOOTH_DEVICE_POWER_OFF_KEY).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                if (!mBluetoothManager.isConnected()) {
                    Toast.makeText(mActivity, "Bluetooth is not connected", Toast.LENGTH_SHORT).show();
                    return true;
                }
                mSys.bluetoothDevicePoweroff();
                return true;
            }
        });

        findPreference(BLUETOOTH_DEVICE_SET_SCP03_KEY_KEY).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                if (!mBluetoothManager.isConnected()) {
                    Toast.makeText(mActivity, "Bluetooth is not connected", Toast.LENGTH_SHORT).show();
                    return true;
                }
                //just a sample, use your own key
                byte[] enckey = new byte[16];
                Arrays.fill(enckey, (byte) 0x11);
                byte[] mackey = new byte[16];
                Arrays.fill(mackey, (byte) 0x22);
                int ret = mSys.SetSCP03Key(enckey, mackey);
                Toast.makeText(mActivity, "SetSCP03Key ret = " + ret, Toast.LENGTH_SHORT).show();
                return true;
            }
        });
    }

    private void discovery() {
        if(mDialog == null) initBluetoothDeviceDialog();
        mDialog.show();
        mBluetoothManager.discovery();
    }

    private void initBluetoothDeviceDialog() {
        mListView = (ListView) View.inflate(mActivity, R.layout.bluetooth_deive_dialog_list, null);
        mAdapter = new LeDeviceListAdapter(mActivity);
        mListView.setAdapter(mAdapter);
        final ExecutorService sigleThreadExecutor = Executors.newSingleThreadExecutor();
        mListView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                Log.d(TAG, "onItemClick");
                final BluetoothDevice device = mAdapter.getAllDeivces().get(position);
                sigleThreadExecutor.execute(new Runnable() {
                    @Override
                    public void run() {
                        Log.d(TAG, "onItemClick start connect...");
                        if (mBluetoothManager.isDiscovering()) {
                            mBluetoothManager.stopDiscovery();
                        }
                        if (mBluetoothManager.isConnected()) {
                            mBluetoothManager.disconnect();
                        }
                        final boolean isConnect = mBluetoothManager.startConnect(device);
                        Log.d(TAG, "onItemClick connect end isConnect = " + isConnect);
                        int msgCode = isConnect ? MSG_CONNECT_SUCCESS : MSG_CONNECT_FAILED;
                        mHandler.sendEmptyMessage(msgCode);
                    }
                });
            }
        });
        mDialog = new AlertDialog.Builder(mActivity)
                .setTitle(getString(R.string.title_connect_bt)).setView(mListView)
                .setNegativeButton(getString(android.R.string.cancel), new DialogInterface.OnClickListener() {

                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        dialog.dismiss();
                        mBluetoothManager.stopDiscovery();
                        mAdapter.clear();
                    }
                }).create();
    }

    private void initSdk() {
        mDriverManager = DriverManager.getInstance();
        mSys = mDriverManager.getBaseSysDevice();
        mSys.showLog(true);
        mBluetoothManager = BluetoothManager.getInstance()
                .setContext(mActivity)
                .setBluetoothListener(new BluetoothListener() {
                    @Override
                    public boolean isReader(BluetoothDevice bluetoothDevice) {
                        mAdapter.addDevice(bluetoothDevice);
                        mAdapter.notifyDataSetChanged();
                        Log.d(TAG, "isReader");
                        return false;
                    }

                    @Override
                    public void startedConnect(BluetoothDevice bluetoothDevice) {
                        Log.d(TAG, "startedConnect");
                    }

                    @Override
                    public void connected(BluetoothDevice bluetoothDevice) {
                        Log.d(TAG, "connected");
                        int res = mSys.sdkInit(ConnectTypeEnum.BLUETOOTH);
                        String initRes = (res == SdkResult.SDK_OK) ?
                                getString(R.string.init_success) : SDK_Result.obtainMsg(mActivity, res);
                        Message msg = Message.obtain();
                        msg.what = MSG_INIT_RESULT;
                        msg.obj = initRes;
                        mHandler.sendMessage(msg);
                    }

                    @Override
                    public void disConnect() {
                        Log.d(TAG, "disConnect");
                    }

                    @Override
                    public void startedDiscovery() {
                        Log.d(TAG, "startedDiscovery");
                    }

                    @Override
                    public void finishedDiscovery() {
                        Log.d(TAG, "finishedDiscovery");
                    }
                })
                .init();
    }

    private OnBluetoothEmvListener mOnBluetoothEmvListenner = new OnBluetoothEmvListener() {
        @Override
        public void onKeyEnter() {

        }

        @Override
        public void onKeyCancel() {

        }

        @Override
        public void onCardDetect(CardDetectedEnum cardDetectedEnum) {
            switch (cardDetectedEnum) {
                case INSERTED:
                    Log.d(TAG, "insert IC card");
                    readICCard();
                    break;
                case REMOVED:
                    Log.d(TAG, "remove IC card");
                    BluetoothDeviceFragment.this.getActivity().runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            DialogUtils.show(getActivity(), "IC card remove");
                        }
                    });
                    break;
                default:
                    break;
            }
        }

        @Override
        public void onEmvTimeout() {

        }

        @Override
        public void onEnterPasswordTimeout() {

        }

        @Override
        public void onEmvStatus(EmvStatusEnum emvStatusEnum) {

        }
    };

    public static final byte[] APDU_SEND_IC = {0x00, (byte) 0xA4, 0x04, 0x00, 0x0E, 0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53, 0x2E, 0x44, 0x44, 0x46, 0x30, 0x31, 0X00};
    private void readICCard() {
        ICCard icCard = mDriverManager.getCardReadManager().getICCard();
        int result = icCard.icCardReset(CardSlotNoEnum.SDK_ICC_USERCARD);
        if (result == SdkResult.SDK_OK) {
            int[] recvLen = new int[1];
            byte[] recvData = new byte[300];
            result = icCard.icExchangeAPDU(CardSlotNoEnum.SDK_ICC_USERCARD, APDU_SEND_IC, recvData, recvLen);
            if (result == SdkResult.SDK_OK) {
                final String apduRecv = StringUtils.convertBytesToHex(recvData).substring(0, recvLen[0] * 2);
                BluetoothDeviceFragment.this.getActivity().runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        DialogUtils.show(getActivity(), "Read IC card result", apduRecv);
                    }
                });
            } else {
                showReadICCardErrorDialog(result);
            }
        } else {
            showReadICCardErrorDialog(result);
        }
        icCard.icCardPowerDown(CardSlotNoEnum.SDK_ICC_USERCARD);
    }

    private void showReadICCardErrorDialog(final int errorCode) {
        BluetoothDeviceFragment.this.getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                DialogUtils.show(getActivity(), "Read IC card failed", "Error code = " + errorCode);
            }
        });
    }

    private void switchFragment(Fragment from, Fragment to, String title) {
        BluetoothDeviceActivity mainactivity = (BluetoothDeviceActivity) mActivity;
        ActionBar actionBar = mainactivity.getSupportActionBar();
        if (actionBar != null) {
            actionBar.setTitle(title);
            actionBar.setDisplayHomeAsUpEnabled(true);
        }
        if (!to.isAdded()) {
            getFragmentManager().beginTransaction().addToBackStack(null).hide(from).add(R.id.frame_container, to).commit();
        } else {
            getFragmentManager().beginTransaction().addToBackStack(null).hide(from).show(to).commit();
        }
    }

    private void updateFirmware(String filename) {
        final File file = new File(filename);
        if (!file.exists()) {
            Toast.makeText(mActivity, "No file exist", Toast.LENGTH_SHORT).show();
            return;
        }
        final ProgressDialog progressDialog = new ProgressDialog(mActivity);
        progressDialog.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        progressDialog.setCancelable(false);
        progressDialog.setCanceledOnTouchOutside(false);
        progressDialog.setTitle("Updating...");
        progressDialog.setMax(100);
        progressDialog.setButton(DialogInterface.BUTTON_POSITIVE, getString(android.R.string.ok), new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                progressDialog.dismiss();
            }
        });
        progressDialog.show();
        progressDialog.getButton(DialogInterface.BUTTON_POSITIVE).setVisibility(View.GONE);
        new Thread(new Runnable() {
            @Override
            public void run() {
                mSys.bluetoothDeviceUpdateFirmware(file, new Sys.UpdateListener() {
                    @Override
                    public void onSuccess() {
                        mActivity.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                progressDialog.dismiss();
                            }
                        });
                    }

                    @Override
                    public void onProgressChange(long cur, long max) {
                        progressDialog.setProgress((int) ((float) cur / max * 100));
                    }

                    @Override
                    public void onError(final int i, final String s) {
                        mActivity.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                progressDialog.setTitle("Update fail: " + s + "  " + i);
                                progressDialog.getButton(DialogInterface.BUTTON_POSITIVE).setVisibility(View.VISIBLE);
                            }
                        });
                    }
                });
            }
        }).start();
    }
}
