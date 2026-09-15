package com.zcs.zcssdkdemo.utils;

import android.app.Activity;
import android.app.PendingIntent;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.nfc.tech.MifareClassic;
import android.util.Log;
import android.widget.Toast;

import java.io.IOException;


/**
 * @author kuan
 * Created on 2019/2/26.
 * @description MifareClassic READ WRITE UTILS
 */
public class M1CardUtils {

    private static PendingIntent pendingIntent;
    public static PendingIntent getPendingIntent(){
        return pendingIntent;
    }

    public static void setPendingIntent(PendingIntent pendingIntent){
        M1CardUtils.pendingIntent = pendingIntent;
    }

    /**
     * Whether support NFC
     * @return
     */
    public static NfcAdapter isNfcAble(Activity mContext){
        NfcAdapter mNfcAdapter = NfcAdapter.getDefaultAdapter(mContext);
        if (mNfcAdapter == null) {
            Toast.makeText(mContext, "Device do not support NFC.", Toast.LENGTH_LONG).show();
        }
        if (!mNfcAdapter.isEnabled()) {
            Toast.makeText(mContext, "Please open the NFC switch.", Toast.LENGTH_LONG).show();
        }

        return mNfcAdapter;
    }



    /**
     * Whether support MifareClassic
     * @param tag
     * @param activity
     * @return
     */
    public static boolean isMifareClassic(Tag tag, Activity activity){
        String[] techList = tag.getTechList();
        boolean haveMifareUltralight = false;
        for (String tech : techList) {
            if (tech.contains("MifareClassic")) {
                haveMifareUltralight = true;
                break;
            }
        }
        if (!haveMifareUltralight) {
            Toast.makeText(activity, "Not support MifareClassic", Toast.LENGTH_LONG).show();
            return false;
        }
        return true;
    }

    /**
     * Whether support {cardType} card
     * @param tag
     * @param activity
     * @param cardType
     * @return
     */
    public static boolean hasCardType(Tag tag, Activity activity, String cardType){

        if (tag == null){
            Toast.makeText(activity,"Swipe card", Toast.LENGTH_LONG).show();
            return false;
        }

        String[] techList = tag.getTechList();

        boolean hasCardType = false;
        for (String tech : techList) {
            Log.e("TagTech",tech);
            if (tech.contains(cardType)) {
                hasCardType = true;
                break;
            }
        }

        if (!hasCardType) {
            Toast.makeText(activity, "not support"+cardType+" card", Toast.LENGTH_LONG).show();
        }

        return hasCardType;
    }

    /**
     * Read CPU card
     * @param tag
     * @return
     * @throws IOException
     */
    public static String readIsoCard(Tag tag) throws IOException {
        IsoDep isoDep = IsoDep.get(tag);
        if (!isoDep.isConnected()){
            isoDep.connect();
        }

        String result = StringUtils.bytesToHexString(isoDep.transceive(StringUtils.hex2Bytes("00A40400023F00")));
        Log.e("readIsoCard",result);
        result = StringUtils.bytesToHexString(isoDep.transceive(StringUtils.hex2Bytes("00B0950030")));
        Log.e("readIsoCard",result);
        isoDep.close();
        return result;
    }

    /**
     * Rewad M1
     * @return
     */
    public static String[][] readCard(Tag tag)  throws IOException {
        MifareClassic mifareClassic = MifareClassic.get(tag);
        try {
            mifareClassic.connect();
            String[][] metaInfo = new String[40][16];
            // get sectorCount from TAG
            int sectorCount = mifareClassic.getSectorCount();
            Log.d("EmvActivity","sectorCount = " + sectorCount);
            for (int j = 0; j < sectorCount; j++) {
                int bCount;
                int bIndex;
                if (m1Auth(mifareClassic,j)) {
                    bCount = mifareClassic.getBlockCountInSector(j);
                    bIndex = mifareClassic.sectorToBlock(j);
                    Log.d("EmvActivity","bCount = " + bCount);
                    for (int i = 0; i < bCount; i++) {
                        byte[] data = mifareClassic.readBlock(bIndex);
                        String dataString = bytesToHexString(data);
                        metaInfo[j][i] = dataString;
                        Log.d("EmvActivity", "read data: " + dataString);
                        bIndex++;
                    }
                } else {
                    Log.e("EmvActivity","m1 auth failed");
                }
            }
            return metaInfo;
        } catch (IOException e){
            throw new IOException(e);
        } finally {
            try {
                mifareClassic.close();
            }catch (IOException e){
                throw new IOException(e);
            }
        }
    }

    public static String[][] readCardSingleData(Tag tag)  throws IOException {
        MifareClassic mifareClassic = MifareClassic.get(tag);
        try {
            mifareClassic.connect();
            String[][] metaInfo = new String[1][2];
            // get sectorCount from TAG
            int sectorCount = mifareClassic.getSectorCount();
            Log.d("zcsNfcDemo","sectorCount = " + sectorCount);

            String result = null;
            for (int j = 0; j < sectorCount; j++) {
                int bCount;
                int bIndex;
                if (m1Auth(mifareClassic,j)) {
                    bCount = mifareClassic.getBlockCountInSector(j);
                    bIndex = mifareClassic.sectorToBlock(j);
                    Log.d("zcsNfcDemo","bCount = " + bCount);
                    for (int i = 0; i < bCount; i++) {
                        byte[] data = mifareClassic.readBlock(bIndex);
                        String dataString = bytesToHexString(data);
                        result = dataString;
                        Log.d("zcsNfcDemo","read data: " + dataString);
                        bIndex++;
                    }
                } else {
                    Log.e("zcsNfcDemo","m1 auth failed");
                }
            }
            metaInfo[0][1] = result;
            return metaInfo;
        } catch (IOException e){
            throw new IOException(e);
        } finally {
            try {
                mifareClassic.close();
            }catch (IOException e){
                throw new IOException(e);
            }
        }
    }

    /**
     * Write block
     * @param block
     * @param blockbyte
     */
    public static boolean writeBlock(Tag tag, int block, byte[] blockbyte) throws IOException {
        MifareClassic mifareClassic = MifareClassic.get(tag);
        try {
            mifareClassic.connect();
            if (m1Auth(mifareClassic,block/4)) {
                mifareClassic.writeBlock(block, blockbyte);
                Log.e("zcsNfcDemo","write Block success");
            } else {
                Log.e("zcsNfcDemo", "m1 auth failed");
                return false;
            }
        } catch (IOException e){
            throw new IOException(e);
        } finally {
            try {
                mifareClassic.close();
            }catch (IOException e){
                throw new IOException(e);
            }
        }
        return true;

    }

    /**
     * M1 authenticate
     * @param mTag
     * @param position
     * @return
     * @throws IOException
     */
    public static boolean m1Auth(MifareClassic mTag, int position) throws IOException {
        if (mTag.authenticateSectorWithKeyA(position, MifareClassic.KEY_DEFAULT)) {
            return true;
        } else if (mTag.authenticateSectorWithKeyB(position, MifareClassic.KEY_DEFAULT)) {
            return true;
        }
        return false;
    }

    private static String bytesToHexString(byte[] src) {
        StringBuilder stringBuilder = new StringBuilder();
        if (src == null || src.length <= 0) {
            return null;
        }
        char[] buffer = new char[2];
        for (int i = 0; i < src.length; i++) {
            buffer[0] = Character.forDigit((src[i] >>> 4) & 0x0F, 16);
            buffer[1] = Character.forDigit(src[i] & 0x0F, 16);
            System.out.println(buffer);
            stringBuilder.append(buffer);
        }
        return stringBuilder.toString();
    }
}
