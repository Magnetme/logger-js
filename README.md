###Logger JS

Standardized logging framework for Magnet.me JavaScript services. 

It provides ways to set up scoped loggers, which can then write to one or more central transports.
Each transport can configure the log thresholds separately, and even scope these per log message scope. 
Additionally, provides a console transport as well as a Kafka transport to hook into the framework.
Additional transports should be created and hooked into the framework separately.