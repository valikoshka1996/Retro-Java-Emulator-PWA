// SPDX-License-Identifier: GPL-3.0-or-later
package retro;
import java.io.*;
import java.nio.file.*;
import java.util.zip.*;
import java.lang.reflect.*;
import org.recompile.mobile.Mobile;
public final class RetroBridge {
 private static Path root(String id) { if(!id.matches("retro_[a-f0-9_]+"))throw new IllegalArgumentException("Invalid app ID");return Paths.get("/files",id); }
 public static void prepare(String id,byte[] jar,String settings,String properties,byte[] rms)throws Exception {
  Path base=root(id);Files.createDirectories(base.resolve("config"));Files.write(base.resolve("app.jar"),jar);
  Files.write(base.resolve("config/settings.conf"),settings.getBytes("UTF-8"));Files.write(base.resolve("config/appproperties.conf"),properties.getBytes("UTF-8"));
  // The application database is authoritative; never reuse a previous session's orphaned RMS.
  Path dir=base.resolve("rms");Files.createDirectories(dir);
  try(DirectoryStream<Path> stream=Files.newDirectoryStream(dir)){for(Path path:stream)Files.delete(path);}
  if(rms!=null&&rms.length>0)try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(rms))){
   ZipEntry entry;byte[] buffer=new byte[8192];long total=0;
   while((entry=zip.getNextEntry())!=null){String name=entry.getName();if(!name.matches("rms/[^/\\\\]+")||name.contains(".."))throw new IOException("Invalid RMS path");
    if(entry.isDirectory())continue;try(OutputStream out=Files.newOutputStream(dir.resolve(name.substring(4)))){int n;while((n=zip.read(buffer))>0){total+=n;if(total>33554432)throw new IOException("RMS too large");out.write(buffer,0,n);}}
   }
  }
 }
 public static byte[] exportRms(String id)throws Exception {
  Path dir=root(id).resolve("rms");ByteArrayOutputStream bytes=new ByteArrayOutputStream();
  try(ZipOutputStream zip=new ZipOutputStream(bytes)){
   if(Files.exists(dir))try(DirectoryStream<Path> stream=Files.newDirectoryStream(dir)){for(Path file:stream){if(!Files.isRegularFile(file))throw new IOException("Unexpected RMS directory");zip.putNextEntry(new ZipEntry("rms/"+file.getFileName().toString()));Files.copy(file,zip);zip.closeEntry();}}
  }return bytes.toByteArray();
 }
 public static void destroy()throws Exception {
  Object loader=Mobile.getPlatform().loader;if(loader==null)return;
  Field field=loader.getClass().getDeclaredField("mainInst");field.setAccessible(true);Object midlet=field.get(loader);if(midlet==null)return;
  Class<?> klass=midlet.getClass();Method method=null;
  while(klass!=null){try{method=klass.getDeclaredMethod("destroyApp",boolean.class);break;}catch(NoSuchMethodException e){klass=klass.getSuperclass();}}
  if(method==null)throw new NoSuchMethodException("destroyApp");method.setAccessible(true);method.invoke(midlet,true);
 }
}
