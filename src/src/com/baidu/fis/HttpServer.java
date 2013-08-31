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
import org.eclipse.jetty.webapp.WebAppContext;

import php.java.servlet.ContextLoaderListener;
import php.java.servlet.fastcgi.FastCGIServlet;

public class HttpServer {
	
	public static void main(String[] args) throws Exception {
		int port = 8080;
		boolean rewrite = false;
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
			} else if(arg.substring(0, 2).equals("--")) {
				map.put(arg.substring(2), args[++i]);
			}
		}
		new HttpServer(port, script, rewrite, root, map);
	}

	public HttpServer(int port, String script, boolean rewrite, String root, HashMap<String, String> map) {
		HandlerCollection hc = new HandlerCollection();
		WebAppContext context;
		boolean hasCGI = map.get("php_exec") != null;
		if(hasCGI && rewrite){
			context = new FISWebAppContext(root, "/" + script);
		} else {
			context = new WebAppContext(root, "/");
		}
		if(hasCGI){
			Iterator<Entry<String, String>> iter = map.entrySet().iterator();
			while(iter.hasNext()){
				Entry<String, String> entry = iter.next();
				String key = entry.getKey().toLowerCase();
				String value = entry.getValue();
				System.setProperty("php.java.bridge." + key, value);
			}
			String descriptor = Thread.currentThread().getClass().getResource("/jetty/web.xml").toString();
			context.setDefaultsDescriptor(descriptor);
			context.addServlet(FastCGIServlet.class, "*.php");
			context.addEventListener(new ContextLoaderListener());
		}
		hc.addHandler(context);
		Server server = new Server(port);
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