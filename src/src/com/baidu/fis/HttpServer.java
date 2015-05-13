package com.baidu.fis;

import java.io.IOException;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map.Entry;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;


import org.eclipse.jetty.server.Request;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.handler.HandlerCollection;
import org.eclipse.jetty.server.ssl.SslSocketConnector;
import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.eclipse.jetty.webapp.WebAppContext;

import php.java.servlet.ContextLoaderListener;
import php.java.servlet.fastcgi.FastCGIServlet;

public class HttpServer {
	
	public static void main(String[] args) throws Exception {
		int port = 8080;
		boolean rewrite = false;
		boolean https = false;//是否支持
		String script = "index.php";
		String root = System.getProperty("user.dir");
		HashMap<String, String> map = new HashMap<String, String>();
		for(int i = 0; i < args.length; i++){
			String arg = args[i];
			if(arg.equals("--port")){
				int p = Integer.parseInt(args[++i]);
				if(p > 0){
					port = p;
				} else {
					throw new Exception("invalid port");
				}
			} else if(arg.equals("--script")){
				script = args[++i];
				char c = script.charAt(0);
				if(c == '/' || c == '\\'){
					script = script.substring(1);
				}
			} else if(arg.equals("--rewrite")){
				String value = args[++i];
				rewrite = value.equals("true") || value.equals("on") || value.equals("1");
			} else if(arg.equals("--root")){
				root = args[++i];
			} else if(arg.equals("--https")){
				https = true;
			}else if(arg.substring(0, 2).equals("--")) {
				map.put(arg.substring(2), args[++i]);
			}
		}
		new HttpServer(port, script, rewrite, root, map, https);
	}
	
	/*
	 * 生成服务端密钥库
	 * keytool -genkey -alias fis  -keyalg RSA -dname "cn=127.0.0.1,ou=fis,o=baidu,l=china,st=beijing,c=cn" -keypass 123456 -storepass 123456 -keystore fis.keystore -validity 3600 
	 * [-keypass]是密钥的密码，[-storepass]是密钥库的密码 
	 * cn是域名，必须与cas服务器的域名相同(本地测试用127.0.0.1). 
	 */
	
	/**
	 * 添加https服务器支持
	 */
	public HttpServer(int port, String script, boolean rewrite, String root, HashMap<String, String> map,boolean https) {
		//context
		HandlerCollection hc = new HandlerCollection();
		WebAppContext context;
		boolean hasCGI = map.get("php_exec") != null;
		if(rewrite){
			context = new FISWebAppContext(root, "/" + script);
		} else {
			context = new WebAppContext(root, "/");
		}
		
		//set default descriptor
		String descriptor = Thread.currentThread().getClass().getResource("/jetty/web.xml").toString();
		context.setDefaultsDescriptor(descriptor);
		
		//servlet
		if(hasCGI){
			Iterator<Entry<String, String>> iter = map.entrySet().iterator();
			while(iter.hasNext()){
				Entry<String, String> entry = iter.next();
				String key = entry.getKey().toLowerCase();
				String value = entry.getValue();
				System.setProperty("php.java.bridge." + key, value);
			}
			context.addServlet(FastCGIServlet.class, "*.php");
			context.addEventListener(new ContextLoaderListener());
		}
			
		Server server;
	
		// 设置ssl连接器，支持https
		if(https){
			server = new Server();
			SslSocketConnector ssl_connector = new SslSocketConnector();
	        ssl_connector.setPort(port);
	        SslContextFactory cf = ssl_connector.getSslContextFactory();
	        //证书放置在插件根目录下，需提供生成时对应的密码
	        cf.setKeyStorePath("../fis.keystore");
	        cf.setKeyStorePassword("123456");
	        cf.setKeyManagerPassword("123456");
	        server.addConnector(ssl_connector);
		}else{ //http
			server = new Server(port);
		}	
		hc.addHandler(context);	
		server.setHandler(hc);
          
		try {
			server.start();
		} catch(Exception e){
			System.out.print("fail");
		}      
	}

	private class FISWebAppContext extends WebAppContext {
		
		private String filename = "/index.php";
		
		public FISWebAppContext(String root, String input) {
			super(root, "/");
			filename = input;
		}

		@Override
		public void doScope(String target, Request baseRequest,
				HttpServletRequest request, HttpServletResponse response)
				throws IOException, ServletException {
			super.doScope(filename, baseRequest, request, response);
		}
	}
}