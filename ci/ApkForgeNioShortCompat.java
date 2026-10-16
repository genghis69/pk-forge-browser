package com.android.tools.r8.dex;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;
import java.util.IdentityHashMap;

/**
 * Browser-safe NIO 16-bit writes. Preserves the D8-generated instruction
 * values, never guesses/reconstructs bytecode after compilation.
 */
public final class ApkForgeNioShortCompat {
  private ApkForgeNioShortCompat() {}
  private static final IdentityHashMap<ShortBuffer, View> VIEWS = new IdentityHashMap<>();
  private static final class View {
    final ByteBuffer parent;
    final int start;
    View(ByteBuffer parent){this.parent=parent;this.start=parent.position();}
  }

  private static void writeBytes(ByteBuffer parent, int byteIndex, int value) {
    int i=parent.arrayOffset()+byteIndex;
    byte[] output=parent.array();
    if (i<0||i+1>=output.length)throw new IllegalStateException("DEX short out of bounds");
    if(parent.order()==ByteOrder.LITTLE_ENDIAN){
      output[i]=(byte)value;
      output[i+1]=(byte)(value>>>8);
    }else{
      output[i]=(byte)(value>>>8);
      output[i+1]=(byte)value;
    }
  }
  public static ByteBuffer putShort(ByteBuffer dest,short value) {
    int position=dest.position();
    dest.put((byte)(value&0xff));
    dest.put((byte)((value>>>8)&0xff));
    if(dest.order()==ByteOrder.BIG_ENDIAN)
      writeBytes(dest,position,value);
    return dest;
  }
  public static ByteBuffer putShortAt(ByteBuffer dest,int index,short value) {
    writeBytes(dest,index,value&0xffff);return dest;
  }
  public static ShortBuffer view(ByteBuffer src) {
    ShortBuffer result=src.asShortBuffer();
    synchronized(VIEWS){VIEWS.put(result,new View(src));}
    return result;
  }
  private static void write(ShortBuffer buf,int index,short value) {
    View v;
    synchronized(VIEWS){v=VIEWS.get(buf);}
    if(v!=null)writeBytes(v.parent,v.start+index*2,value&0xffff);
  }
  public static ShortBuffer put(ShortBuffer dest,short value){
    int index=dest.position();
    dest.put(value);
    write(dest,index,value);
    return dest;
  }
  public static ShortBuffer putAt(ShortBuffer dest,int index,short value){
    dest.put(index,value);
    write(dest,index,value);
    return dest;
  }
  public static ShortBuffer putArray(ShortBuffer dest,short[] values){
    int start=dest.position();
    dest.put(values);
    for(int i=0;i<values.length;i++)write(dest,start+i,values[i]);
    return dest;
  }
  public static ShortBuffer putArrayRange(ShortBuffer dest,short[] values,int offset,int length){
    int start=dest.position();
    dest.put(values,offset,length);
    for(int i=0;i<length;i++)write(dest,start+i,values[offset+i]);
    return dest;
  }
  public static ShortBuffer putBuffer(ShortBuffer dest,ShortBuffer source){
    int start=dest.position(),remaining=source.remaining();
    short[] copy=new short[remaining];
    for(int i=0;i<remaining;i++)copy[i]=source.get(source.position()+i);
    dest.put(source);
    for(int i=0;i<copy.length;i++)write(dest,start+i,copy[i]);
    return dest;
  }
}
