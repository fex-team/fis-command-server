# fis-command-server

## $ fis server --help

    Usage: server <command> [options]
    
    Commands:
    
        start                  start server
        stop                   shutdown server
        restart                restart server
        info                   output server info
        open                   open document root directory
        install <name>         install server framework
    
    Options:
    
        -h, --help                     output usage information
        -p, --port <int>               server listen port
        --root <path>                  document root
        --script <name>                rewrite entry file name
        --php_exec <path>              path to php-cgi executable file
        --php_exec_args <args>         php-cgi arguments
        --php_fcgi_children <int>      the number of php-cgi processes
        --php_fcgi_max_requests <int>  the max number of requests
        --no-rewrite                   disable rewrite feature