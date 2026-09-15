package com.zcs.zcssdkdemo;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.preference.Preference;
import android.preference.PreferenceFragment;
import android.preference.PreferenceGroup;
import android.text.Layout;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.widget.Toast;

import androidx.print.PrintHelper;

import com.google.zxing.BarcodeFormat;
import com.zcs.sdk.DriverManager;
import com.zcs.sdk.Printer;
import com.zcs.sdk.SdkData;
import com.zcs.sdk.SdkResult;
import com.zcs.sdk.print.PrnStrFormat;
import com.zcs.sdk.print.PrnTextFont;
import com.zcs.sdk.print.PrnTextStyle;
import com.zcs.zcssdkdemo.utils.BitmapUtils;
import com.zcs.zcssdkdemo.utils.StringUtils;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;

public class PrintFragment extends PreferenceFragment {

    private static final String KEY_COMMON_PRINT_CATEGORY = "common_print_paper_key";
    private static final String KEY_PRINT_TEXT = "print_text_key";
    private static final String KEY_PRINT_RECEIPT_SAMPLE = "print_receipt_sample_key";
    private static final String KEY_PRINT_QRCODE = "print_qrcode_key";
    private static final String KEY_PRINT_BARCODE = "print_barcode_key";
    private static final String KEY_PRINT_BITMAP = "print_bitmap_key";
    private static final String KEY_CUT_PAPER = "cut_paper_key";

    private static final String KEY_PRINT_LABEL = "print_lable_key";
    private static final String KEY_LABEL_PAPER_OUT = "label_paper_out_key";

    private static final String KEY_PRINT_WITH_SERVICE = "print_with_android_service_key";
    private static final String KEY_CONNECT_BLUETOOTH = "connect_bluetooth";
    private static final String KEY_PRINT_TEXT_WITH_BLUETOOTH = "print_text_with_bluetooth_key";
    private static final String KEY_PRINT_QRCODE_WITH_BLUETOOTH = "print_qrcode_with_bluetooth_key";
    private static final String KEY_PRINT_BARCODE_WITH_BLUETOOTH = "print_barcode_with_bluetooth_key";
    private static final String KEY_PRINT_BITMAP_WITH_BLUETOOTH = "print_bitmap_with_bluetooth_key";
    private static final String TAG = "PrintFragment";

    private DriverManager mDriverManager;
    private Printer mPrinter;

    private boolean isSupportCutter = false;

    private Context mContext;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        addPreferencesFromResource(R.xml.pref_print);
        mContext = getActivity();
        mDriverManager = DriverManager.getInstance();
        mPrinter = mDriverManager.getPrinter();
        isSupportCutter = mPrinter.isSupportCutter();
    }

    @Override
    public void onViewCreated(View view, Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        findPreference(KEY_PRINT_TEXT).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                //printText();
                printTestStore1();
                return true;
            }
        });

        findPreference(KEY_PRINT_RECEIPT_SAMPLE).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                //printMonoText();
                printReceiptSample();
                //printTestStore2();
                return true;
            }
        });

        findPreference(KEY_PRINT_QRCODE).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                printQrcode("www.google.com");
                return true;
            }
        });

        findPreference(KEY_PRINT_BARCODE).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                printBarCode128("6922711079066");
                return true;
            }
        });

        findPreference(KEY_PRINT_BITMAP).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                InputStream inputStream = null;
                try {
                    inputStream = getActivity().getAssets().open("print_demo.bmp");
                } catch (IOException e) {
                    e.printStackTrace();
                }
                if(inputStream == null) {
                    return true;
                }
                Drawable drawable = Drawable.createFromStream(inputStream, null);
                Bitmap bitmap = ((BitmapDrawable) drawable).getBitmap();
                printBitmap(bitmap);
                return true;
            }
        });

        findPreference(KEY_PRINT_LABEL).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                InputStream inputStream = null;
                try {
                    inputStream = getActivity().getAssets().open("label_photo_demo.bmp");
                } catch (IOException e) {
                    e.printStackTrace();
                }
                if(inputStream == null) {
                    return true;
                }
                Drawable drawable = Drawable.createFromStream(inputStream, null);
                Bitmap bitmap = ((BitmapDrawable) drawable).getBitmap();
                printLabel(bitmap, 3);
                return true;
            }
        });

        findPreference(KEY_LABEL_PAPER_OUT).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                labelPaperOut();
                return true;
            }
        });

        findPreference(KEY_PRINT_WITH_SERVICE).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                InputStream inputStream = null;
                try {
                    inputStream = getActivity().getAssets().open("label_photo_demo.bmp");
                } catch (IOException e) {
                    e.printStackTrace();
                }
                if(inputStream == null) {
                    return true;
                }
                Drawable drawable = Drawable.createFromStream(inputStream, null);
                Bitmap bitmap = ((BitmapDrawable) drawable).getBitmap();
                printWithService(bitmap);
                return true;
            }
        });

        findPreference(KEY_CONNECT_BLUETOOTH).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                scanAndConnectBluetooth();
                return true;
            }
        });

        findPreference(KEY_PRINT_TEXT_WITH_BLUETOOTH).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                printTextWithBluetooth("Print text with bluetooth printer\n");
                return true;
            }
        });

        findPreference(KEY_PRINT_QRCODE_WITH_BLUETOOTH).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                printQRCodeWithBluetooth("www.google.com");
                return true;
            }
        });

        findPreference(KEY_PRINT_BARCODE_WITH_BLUETOOTH).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                printBarCodeWithBluetooth("6922711079066", CODE128, 48);
                return true;
            }
        });

        findPreference(KEY_PRINT_BITMAP_WITH_BLUETOOTH).setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                InputStream inputStream = null;
                try {
                    inputStream = getActivity().getAssets().open("label_photo_demo.bmp");
                } catch (IOException e) {
                    e.printStackTrace();
                }
                if(inputStream == null) {
                    return true;
                }
                Drawable drawable = Drawable.createFromStream(inputStream, null);
                Bitmap bitmap = ((BitmapDrawable) drawable).getBitmap();
                printBitmapWithBluetooth(bitmap);
                return true;
            }
        });

        Preference cutPreference = findPreference(KEY_CUT_PAPER);
        cutPreference.setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
            @Override
            public boolean onPreferenceClick(Preference preference) {
                cutPaper();
                return true;
            }
        });
        if(!isSupportCutter) {
            ((PreferenceGroup)findPreference(KEY_COMMON_PRINT_CATEGORY)).removePreference(cutPreference);
        }
    }
    
    private void printText() {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus == SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            //out of paper
            Toast.makeText(getActivity(), "Out of paper", Toast.LENGTH_SHORT).show();
        } else {
            PrnStrFormat format = new PrnStrFormat();
            format.setTextSize(30);
            format.setAli(Layout.Alignment.ALIGN_CENTER);
            format.setStyle(PrnTextStyle.BOLD);
            //format.setFont(PrnTextFont.CUSTOM);
            //format.setPath(Environment.getExternalStorageDirectory() + "/fonts/simsun.ttf");
            format.setFont(PrnTextFont.SANS_SERIF);
            mPrinter.setPrintAppendString("POS SALES SLIP", format);
            format.setTextSize(25);
            format.setStyle(PrnTextStyle.NORMAL);
            format.setAli(Layout.Alignment.ALIGN_NORMAL);
            mPrinter.setPrintAppendString(" ", format);
            mPrinter.setPrintAppendString("MERCHANGT NAME:" + " Test ", format);
            mPrinter.setPrintAppendString("MERCHANT NO:" + " 123456789012345 ", format);
            mPrinter.setPrintAppendString("TERMINAL NAME:" + " 12345678 ", format);
            mPrinter.setPrintAppendString("OPERATOR NO:" + " 01 ", format);
            mPrinter.setPrintAppendString("CARD NO: ", format);
            format.setAli(Layout.Alignment.ALIGN_CENTER);
            format.setTextSize(30);
            format.setStyle(PrnTextStyle.BOLD);
            mPrinter.setPrintAppendString("6214 44** **** **** 7816", format);
            format.setAli(Layout.Alignment.ALIGN_NORMAL);
            format.setStyle(PrnTextStyle.NORMAL);
            format.setTextSize(25);
            mPrinter.setPrintAppendString(" -----------------------------", format);
            mPrinter.setPrintAppendString(" ", format);
            mPrinter.setPrintAppendString(" ", format);
            mPrinter.setPrintAppendString(" ", format);
            mPrinter.setPrintAppendString(" ", format);
            printStatus = mPrinter.setPrintStart();
        }
    }

    private void printMonoText() {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus == SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            //out of paper
            Toast.makeText(getActivity(), "Out of paper", Toast.LENGTH_SHORT).show();
        } else {
            PrnStrFormat format = new PrnStrFormat();
            format.setTextSize(24);
            format.setAli(Layout.Alignment.ALIGN_NORMAL);
            format.setAm(getActivity().getAssets());
            format.setPath("font/Montserrat-Regular.ttf");
            format.setFont(PrnTextFont.CUSTOM);
            //format.setFont(PrnTextFont.MONOSPACE);
            String aLongName = "I am a very very very very very very very very very long name";
            String[] longNameArray = longStringToStringArray(aLongName, 30 - 2 - 11);//30: total; 2: the space; 11:the first part

            mPrinter.setPrintAppendString("ALIGN NORMAL", format);
            mPrinter.setPrintAppendString("Date   " + ": 11/11/2011,", format);
            mPrinter.setPrintAppendString("Transactio" + "", format);
            mPrinter.setPrintAppendString("ns        " + "  11:11 TEST ", format);
            mPrinter.setPrintAppendString("Agent Code" + ": TEST123456789", format);
            //mPrinter.setPrintAppendString("Nama Agen " + ": Abdul Aziz", format);
            mPrinter.setPrintAppendString("Agent name" + ": " + longNameArray[0], format);
            if(longNameArray.length > 1) {
                for(int i = 0; i < longNameArray.length - 1; i ++) {
                    mPrinter.setPrintAppendString("          " + "  " + longNameArray[i + 1], format);
                }
            }
            String IdTransactionsString = "5030617019324949110001";
            String IdTransactionsStringPart1 = IdTransactionsString.substring(0,16);
            String IdTransactionsStringPart2 = IdTransactionsString.substring(17);
            mPrinter.setPrintAppendString("ID Transac" + ": " + IdTransactionsStringPart1, format);
            mPrinter.setPrintAppendString("tions     " + "  " + IdTransactionsStringPart2, format);
            mPrinter.setPrintAppendString("PaymentSys" + "", format);
            mPrinter.setPrintAppendString("tem Method" + " Cards", format);
            mPrinter.setPrintAppendString("TID       " + ": 12004625", format);
            mPrinter.setPrintAppendString("Card type " + ": Discharge", format);
            String cardNoString = "************34191234";
            String cardNoStringPart1 = cardNoString.substring(0,16);
            String cardNoStringPart2 = cardNoString.substring(17);
            mPrinter.setPrintAppendString("Card No.  " + ": " + cardNoStringPart1, format);
            mPrinter.setPrintAppendString("          " + "  " + cardNoStringPart2, format);
            mPrinter.setPrintAppendString("Jurnal    " + ": 900042", format);
            mPrinter.setPrintAppendString("Transfer  " + "", format);
            String referenceNoString = "202310714014556300550306";
            String ReferenceNoStringPart1 = referenceNoString.substring(0,16);
            String ReferenceNoStringPart2 = referenceNoString.substring(17);
            mPrinter.setPrintAppendString("Reference " + ": " + ReferenceNoStringPart1, format);
            mPrinter.setPrintAppendString("No.       " + "  " + ReferenceNoStringPart2, format);
            mPrinter.setPrintAppendString("Service   " + ": ZAKAT", format);
            mPrinter.setPrintAppendString("type      " + "", format);
            mPrinter.setPrintAppendString(" ", format);
            printStatus = mPrinter.setPrintStart();
        }
    }

    private String[] longStringToStringArray(String name, int limit) {
        int size = name.length();
        String[] nameArray;
        if(size <= limit) {
            nameArray =  new String[0];
            nameArray[0] = name;
            return nameArray;
        }
        int arraySize = size / limit + 1;
        nameArray = new String[arraySize];
        for(int i = 0; i < arraySize; i ++) {
            nameArray[i] = name.substring(i * limit, (i + 1) * limit > size ? size : (i + 1) * limit);
        }
        return nameArray;
    }

    private void printReceiptSample() {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus == SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            //out of paper
            Toast.makeText(getActivity(), "Out of paper", Toast.LENGTH_SHORT).show();
        } else {
            /*
            PrnStrFormat itemFormat = new PrnStrFormat();
            itemFormat.setTextSize(30);
            itemFormat.setStyle(PrnTextStyle.BOLD);
            itemFormat.setFont(PrnTextFont.SANS_SERIF);
            itemFormat.setFont(PrnTextFont.MONOSPACE);

            PrnStrFormat countFormat = new PrnStrFormat();
            countFormat.setTextSize(24);
            countFormat.setAli(Layout.Alignment.ALIGN_OPPOSITE);
            countFormat.setFont(PrnTextFont.MONOSPACE);

            PrnStrFormat totalFormat = new PrnStrFormat();
            totalFormat.setTextSize(24);
            totalFormat.setAli(Layout.Alignment.ALIGN_OPPOSITE);
            totalFormat.setFont(PrnTextFont.MONOSPACE);

            int colsWidth[] = new int[] { 2, 1, 1};
            String item[] = new String[]{"Apple","X1","$0.99"};
            PrnStrFormat formats[] = new PrnStrFormat[] {itemFormat, countFormat, totalFormat};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Pear","X 10","$1.99"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Tomatoes","X 10","$1.97"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Orange","X 13","$1.98"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Watermelon","X 14","$1.99"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            mPrinter.setPrintAppendString(" ", itemFormat);
            mPrinter.setPrintStart();
             */

            PrnStrFormat keyFormat = new PrnStrFormat();
            keyFormat.setTextSize(24);
            keyFormat.setAm(getActivity().getAssets());
            keyFormat.setPath("font/Montserrat-Regular.ttf");
            keyFormat.setFont(PrnTextFont.CUSTOM);
            PrnStrFormat valueFormat = new PrnStrFormat();
            valueFormat.setTextSize(24);
            valueFormat.setAm(getActivity().getAssets());
            valueFormat.setPath("font/Montserrat-Regular.ttf");
            valueFormat.setFont(PrnTextFont.CUSTOM);
            valueFormat.setAli(Layout.Alignment.ALIGN_OPPOSITE);
            int colsWidth[] = new int[] { 10, 2, 18};
            PrnStrFormat formats[] = new PrnStrFormat[] {keyFormat, valueFormat, valueFormat};
            String item[] = new String[]{"Date",": ", "2023.12.13"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Transactions",": ", "11:11 TEST"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Payment System Method",": ", "Cards"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Agent Code",": ", "TEST123456789"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            String aLongName = "I am a very very very very very very very very very long name";
            item = new String[]{"Agent name",": ", aLongName};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"ID Transactions",": ", "5030617019324949110001"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"TID",": ", "12004625"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Card type",": ", "Discharge"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Card No.",": ", "************34191234"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Jurnal",": ", "900042"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Transfer","", ""};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Reference No.",": ", "202310714014556300550306"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            item = new String[]{"Service type.",": ", "ZAKAT"};
            mPrinter.setPrintAppendStrings(item, colsWidth, formats);
            mPrinter.setPrintAppendString(" ", keyFormat);
            mPrinter.setPrintStart();
        }
    }

    private void printTestStore1() {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus == SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            //out of paper
            Toast.makeText(getActivity(), "Out of paper", Toast.LENGTH_SHORT).show();
        } else {
            PrnStrFormat format = new PrnStrFormat();
            format.setTextSize(25);
            format.setStyle(PrnTextStyle.NORMAL);
            format.setFont(PrnTextFont.MONOSPACE);

            String textToPrint = "TEST STORE";
            format.setAli(Layout.Alignment.ALIGN_CENTER);
            mPrinter.setPrintAppendString(textToPrint, format);

            textToPrint = "test";
            mPrinter.setPrintAppendString(textToPrint, format);

            textToPrint = "7778888857";
            mPrinter.setPrintAppendString(textToPrint, format);

            format.setAli(Layout.Alignment.ALIGN_NORMAL);
            textToPrint =
                    "-----------------------------------------\n" +  //monospace 25 text size, will be 41 characters
                    "15/12/2023                       12:26 PM\n" +
                    "Biller Name:Admin                        \n" +
                    "-----------------------------------------\n" +
                    "Item Name                   QTY   SP  Amt\n" +
                    "-----------------------------------------\n" +
                    "Food                          1 2.00 2.00\n" +
                    "Home Care                     1 3.00 3.00\n" +
                    "-----------------------------------------\n" +
                    "Item/QTY:2/2\n" +
                    "-----------------------------------------\n" +
                    "Net Amount:                          5.00\n" +
                    "-----------------------------------------\n" +
                    "Cash Paid:                           5.00\n";
            mPrinter.setPrintAppendString(textToPrint, format);

            format.setAli(Layout.Alignment.ALIGN_CENTER);
            textToPrint = "Thank You. Come Again!";
            mPrinter.setPrintAppendString(textToPrint, format);
            mPrinter.setPrintAppendString("", format);

            format.setAli(Layout.Alignment.ALIGN_NORMAL);
            textToPrint = "E&0E                  Powered By SnapBizz";
            mPrinter.setPrintAppendString(textToPrint, format);
            mPrinter.setPrintAppendString("", format);
            mPrinter.setPrintAppendString("", format);
            mPrinter.setPrintStart();
            mPrinter.openPrnCutter((byte)1);
        }
    }

    //Based on sdk version 1.8.1
    private void printTestStore2() {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus == SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            //out of paper
            Toast.makeText(getActivity(), "Out of paper", Toast.LENGTH_SHORT).show();
        } else {
            PrnStrFormat format = new PrnStrFormat();
            format.setTextSize(25);
            format.setStyle(PrnTextStyle.NORMAL);
            format.setFont(PrnTextFont.MONOSPACE);

            String textToPrint = "TEST STORE";
            format.setAli(Layout.Alignment.ALIGN_CENTER);
            mPrinter.setPrintAppendString(textToPrint, format);

            textToPrint = "test";
            mPrinter.setPrintAppendString(textToPrint, format);

            textToPrint = "7778888857";
            mPrinter.setPrintAppendString(textToPrint, format);

            PrnStrFormat rightFormat = new PrnStrFormat();
            rightFormat.setTextSize(25);
            rightFormat.setStyle(PrnTextStyle.NORMAL);
            rightFormat.setFont(PrnTextFont.MONOSPACE);
            rightFormat.setAli(Layout.Alignment.ALIGN_OPPOSITE);

            format.setAli(Layout.Alignment.ALIGN_NORMAL);
            String splitLine = "-----------------------------------------"; //monospace 25 text size, will be 41 characters
            mPrinter.setPrintAppendString(splitLine, format);

            String date = "15/12/2023";
            String time = "12:26 PM";
            mPrinter.setPrintAppendStrings(new String[] {date, time}, new int[] {1,1}, new PrnStrFormat[] {format, rightFormat});

            textToPrint = "Biller Name:Admin\n" + splitLine;
            mPrinter.setPrintAppendString(textToPrint, format);

            String item = "Item Name";
            String qty = "Qty";
            String sp = "SP";
            String Amt = "Amt";
            mPrinter.setPrintAppendStrings(new String[] {item, qty, sp, Amt},
                    new int[] {4,1,1,1},//The proportion of the width occupied by each string
                    new PrnStrFormat[] {format, rightFormat, rightFormat, rightFormat});

            mPrinter.setPrintAppendString(splitLine, format);

            item = "Food";
            qty = "1";
            sp = "2.00";
            Amt = "2.00"; //qty * sp
            mPrinter.setPrintAppendStrings(new String[] {item, qty, sp, Amt},
                    new int[] {4,1,1,1},
                    new PrnStrFormat[] {format, rightFormat, rightFormat, rightFormat});

            item = "Home Care";
            qty = "1";
            sp = "3.00";
            Amt = "3.00"; //qty * sp
            mPrinter.setPrintAppendStrings(new String[] {item, qty, sp, Amt},
                    new int[] {4,1,1,1},
                    new PrnStrFormat[] {format, rightFormat, rightFormat, rightFormat});

            textToPrint = splitLine + "\n" +
                    "Item/QTY:2/2\n" +
                    splitLine;
            mPrinter.setPrintAppendString(textToPrint, format);
            item = "Net Amount:";
            Amt = "5.00";
            mPrinter.setPrintAppendStrings(new String[] {item, Amt}, new int[] {1,1}, new PrnStrFormat[] {format, rightFormat});

            mPrinter.setPrintAppendString(splitLine, format);
            item = "Cash Paid:";
            Amt = "5.00";
            mPrinter.setPrintAppendStrings(new String[] {item, Amt}, new int[] {1,1}, new PrnStrFormat[] {format, rightFormat});

            format.setAli(Layout.Alignment.ALIGN_CENTER);
            textToPrint = "Thank You. Come Again!";
            mPrinter.setPrintAppendString(textToPrint, format);
            mPrinter.setPrintAppendString("", format);

            format.setAli(Layout.Alignment.ALIGN_NORMAL);
            item = "E&0E";
            Amt = "Powered By SnapBizz";
            mPrinter.setPrintAppendStrings(new String[] {item, Amt}, new int[] {1,1}, new PrnStrFormat[] {format, rightFormat});
            mPrinter.setPrintAppendString("", format);
            mPrinter.setPrintAppendString("", format);
            mPrinter.setPrintStart();
            mPrinter.openPrnCutter((byte)1);
        }
    }
    
    private void printQrcode(String qrString) {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus != SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            mPrinter.setPrintAppendQRCode(qrString, 200, 200, Layout.Alignment.ALIGN_CENTER);
            printStatus = mPrinter.setPrintStart();
        }
    }
    
    private void printBarCode128(String barcodeString) {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus != SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            mPrinter.setPrintAppendBarCode(getActivity(), barcodeString, 360, 100, true, Layout.Alignment.ALIGN_CENTER, BarcodeFormat.CODE_128);
            printStatus = mPrinter.setPrintStart();
        }
    }

    private void printBitmap(Bitmap bitmap) {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus != SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            mPrinter.setPrintAppendBitmap(bitmap, Layout.Alignment.ALIGN_CENTER);
            printStatus = mPrinter.setPrintStart();
        }
    }

    private void cutPaper() {
        int printStatus = mPrinter.getPrinterStatus();
        if(printStatus == SdkResult.SDK_OK) {
            mPrinter.openPrnCutter((byte) 1);
        }
    }

    private void printLabel(Bitmap bitmap) {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus != SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            mPrinter.printLabel(bitmap);
        }
    }

    private void printLabel(final Bitmap bitmap, int copies) {
        int ret = mPrinter.getPrinterStatus();
        if(ret != SdkResult.SDK_OK) {
            return;
        }
        ExecutorService singleThreadExecutor = mDriverManager.getSingleThreadExecutor();
        for(int i = 0; i < copies; i ++) {
            singleThreadExecutor.execute(new Runnable() {
                @Override
                public void run() {
                    int printStatus = mPrinter.getPrinterStatus();
                    if (printStatus != SdkResult.SDK_PRN_STATUS_PAPEROUT) {
                        mPrinter.printLabel(bitmap);
                    }
                }
            });
        }
    }

    private void labelPaperOut() {
        int printStatus = mPrinter.getPrinterStatus();
        if (printStatus != SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            if(mPrinter.is80MMPrinter()) {
                mPrinter.setPrintType(SdkData.LABEL_PAPER_80MM);
            } else {
                mPrinter.setPrintType(SdkData.LABEL_PAPER);
            }
            mPrinter.setPrintLine(30);
        }
    }

    private void printWithService(Bitmap bitmap) {
        PrintHelper printHelper = new PrintHelper(getActivity());
        printHelper.setScaleMode(PrintHelper.SCALE_MODE_FIT);
        printHelper.printBitmap("TestDemo", bitmap);
    }

    //below for BT print
    BluetoothAdapter mBluetoothAdapter;
    private static final int REQUEST_ENABLE_BLUETOOTH = 10086;
    private static final String BLUETOOTH_ADDRESS = "66:11:22:33:44:55";
    private boolean isScanning = false;
    private boolean isConnecting = false;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private BluetoothSocket mBluetoothSocket;
    private OutputStream mOutputStream;
    private void scanAndConnectBluetooth() {
        mBluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        if(mBluetoothAdapter == null) {
            Log.e(TAG, "Device not support bluetooth");
            return;
        }
        //open bluetooth
        if(!mBluetoothAdapter.isEnabled()) {
            Intent intent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
            startActivityForResult(intent, REQUEST_ENABLE_BLUETOOTH);
        } else {
            startScanBluetooth();
        }
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if(requestCode == REQUEST_ENABLE_BLUETOOTH) {
            if(mBluetoothAdapter.isEnabled()) {
                startScanBluetooth();
            } else {
                Log.e(TAG, "Bluetooth not open");
            }
        }
    }

    private void startScanBluetooth() {
        Set<BluetoothDevice> pairedDevices = mBluetoothAdapter.getBondedDevices();
        Log.d(TAG, "pairedDevices size = " + pairedDevices.size());
        BluetoothDevice pairedDevice = null;
        if (pairedDevices.size() > 0) {
            Log.d(TAG, "pairedDevices");
            for (BluetoothDevice device : pairedDevices) {
                if(isZcsBluetoothPrinter(device)) {
                    pairedDevice = device;
                    break;
                }
            }
        }

        if(pairedDevice != null) {
            connectDevice(pairedDevice);
            return;
        }

        isScanning = true;
        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        getActivity().registerReceiver(mBluetoothFoundReceiver, filter);
        mBluetoothAdapter.startDiscovery();
    }

    private BroadcastReceiver mBluetoothFoundReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if(action.equals(BluetoothDevice.ACTION_FOUND)) {
                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                Log.d(TAG, "address = " + device.getAddress());
                if(isZcsBluetoothPrinter(device)) {
                    connectDevice(device);
                }
            }
        }
    };

    private void connectDevice(BluetoothDevice device) {
        Log.d(TAG, "isScanning = " + isScanning);
        if(isScanning) {
            mBluetoothAdapter.cancelDiscovery();
            getActivity().unregisterReceiver(mBluetoothFoundReceiver);
            isScanning = false;
        }
        Log.d(TAG, "connectDevice");
        if(isConnecting) {
            Log.d(TAG, "is scanning, wait.");
            return;
        } else {
            connectDeviceThread(device);
        }
    }

    private void connectDeviceThread(final BluetoothDevice device) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                isConnecting = true;
                try {
                    mBluetoothSocket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                    mBluetoothSocket.connect();
                    mOutputStream = mBluetoothSocket.getOutputStream();
                    Log.d(TAG, "Connect success");
                    PrintFragment.this.getActivity().runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(mContext, "Connect success", Toast.LENGTH_SHORT).show();
                        }
                    });
                } catch (IOException e) {
                    e.printStackTrace();
                } catch (Exception e) {
                    e.printStackTrace();
                } finally {
                    isConnecting = false;
                }
            }
        }).start();
    }

    private boolean isZcsBluetoothPrinter(BluetoothDevice device) {
        String address = device.getAddress();
        if(TextUtils.equals(address, BLUETOOTH_ADDRESS)) {
            return true;
        }
        return false;
    }

    /**
     * Write to the printer
     *
     * @param buffer The bytes to write
     */
    public synchronized void write(byte[] buffer) {
        if(mOutputStream == null) {
            Log.e(TAG, "Not connect.");
            return;
        }
        int len = buffer.length;
        int idx = 0, count = 0;
        while (idx < len) {
            if (len - idx > 1024 * 100)
                count = 1024 * 100;
            else
                count = len - idx;
            try {
                mOutputStream.write(buffer, idx, count);
            } catch (IOException e1) {
                e1.printStackTrace();
            }
            idx = idx + count;
        }
    }

    /**
     * clear buffer data and reset printer
     */
    public void reset() {
        // reset
        write(RESET);
        // set font
        write(DEFAULT_SIZE);
        // set lang
        write(LANG_DEFAULT);
        flush();
    }

    /**
     * Flush to the printer
     */
    public void flush() {
        try {
            mOutputStream.flush();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public final static byte[] RESET = { 0x1b, 0x40 };
    public final static byte[] DEFAULT_SIZE = { 0x1d, 0x21, 00 };
    public final static byte[] LANG_DEFAULT = { 0x1B, 0x74, (byte) 0x80 };

    private void printTextWithBluetooth(String text) {
        write(text.getBytes());
    }

    private void printBitmapWithBluetooth(Bitmap bitmap) {
        printImage(bitmap);
    }

    /**
     * Print bitmap
     *
     * @param bitmap
     */
    public void printBitmap(Bitmap bitmap, boolean colored) {
        printImage(bitmap, colored);
    }

    private void printImage(Bitmap bitmap) {
        printImage(bitmap, false);
    }
    private void printImage(Bitmap bitmap, boolean colored) {
        if (bitmap != null && bitmap.getWidth() > 384) {
            bitmap = BitmapUtils.scaleBitmap(bitmap, (int) (bitmap.getWidth() / 384f));
        }
        byte[] command = new byte[]{0x1d, 0x76, 0x30, 0x00};
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int bw = (width - 1) / 8 + 1;

        byte[] rv = new byte[height * bw + 4];
        rv[0] = (byte) bw;//xL
        rv[1] = (byte) (bw >> 8);//xH
        rv[2] = (byte) height;
        rv[3] = (byte) (height >> 8);

        int[] pixels = new int[width * height];
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height);

        for (int i = 0; i < height; i++) {
            for (int j = 0; j < width; j++) {
                int color = pixels[width * i + j];
                int r = (color >> 16) & 0xff;
                int g = (color >> 8) & 0xff;
                int b = color & 0xff;
                byte gray = BitmapUtils.rgb2Gray(r, g, b, colored);
                rv[bw * i + j / 8 + 4] = (byte) (rv[bw * i + j / 8 + 4] | (gray << (7 - j % 8)));
            }
        }
        write(StringUtils.concat(command, rv));
    }

    public void printQRCodeWithBluetooth(String qrCodeData) {
        byte[] command = new byte[]{0x1D, 0x28, 0x6B, (byte) (qrCodeData.length() + 3), 0x00, 0x31, 0x50, 0x30};
        command = StringUtils.concat(command, qrCodeData.getBytes());
        byte[] printStartCommand = new byte[]{0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30};
        command = StringUtils.concat(command, printStartCommand);

        // Line feed
        byte[] lineFeedCommand = new byte[]{0x0A};
        command = StringUtils.concat(command, lineFeedCommand);
        write(command);
    }

    public final static byte EAN13 = 67;
    public final static byte CODE128 = 73;

    public void printBarCodeWithBluetooth(String barcode, int type, int height) {
        byte[] data = barcode.getBytes();
        // Set barcode height
        write(new byte[] { 0x1d, 0x68, (byte) height });
        byte[] bytes = new byte[4 + data.length];
        bytes[0] = 0x1d;
        bytes[1] = 0x6b;
        bytes[2] = (byte) type;
        bytes[3] = (byte) data.length;
        for (int i = 4; i < data.length + 4; i++) {
            bytes[i] = data[i - 4];
        }
        write(bytes);
    }

}
