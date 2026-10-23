// Original integration fixture, SPDX-License-Identifier: GPL-3.0-or-later
import javax.microedition.midlet.*;
import javax.microedition.lcdui.*;
import javax.microedition.rms.*;
import javax.microedition.media.*;
public class RmsProbe extends MIDlet {
 private int count;private String status="";private RecordStore store;
 protected void startApp(){
  try{store=RecordStore.openRecordStore("probe",true);if(store.getNumRecords()>0)count=store.getRecord(1)[0]&255;status="RMS READ: "+count;System.out.println("PROBE_READ:"+count);store.closeRecordStore();}catch(Exception e){status=e.toString();}
  Display.getDisplay(this).setCurrent(new Canvas(){
   protected void paint(Graphics g){g.setColor(0x101820);g.fillRect(0,0,getWidth(),getHeight());g.setColor(0x58e6c3);g.drawString("JAVA RETRO / RMS PROBE",8,24,0);g.setColor(0xffffff);g.drawString(status,8,68,0);g.drawString("FIRE: increment + save",8,108,0);g.drawString("0: exit | 1: test tone",8,140,0);}
   public void keyPressed(int key){try{if(key==KEY_NUM0){notifyDestroyed();return;}if(key==KEY_NUM1){Manager.playTone(72,1000,80);return;}if(getGameAction(key)==FIRE){count++;store=RecordStore.openRecordStore("probe",true);byte[] value={(byte)count};if(store.getNumRecords()==0)store.addRecord(value,0,1);else store.setRecord(1,value,0,1);store.closeRecordStore();status="RMS SAVED: "+count;System.out.println("PROBE_SAVED:"+count);repaint();}}catch(Exception e){status=e.toString();repaint();}}
  });
 }
 protected void pauseApp(){}
 protected void destroyApp(boolean force){}
}
