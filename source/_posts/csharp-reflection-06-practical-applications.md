---
title: C# 反射由浅入深 (6) — 实战应用
date: 2026-05-18
tags:
  - C#
  - 反射
  - Reflection
  - 实战应用
  - 框架设计
categories:
  - C# 反射系列
---

## 本篇定位

这是 C# 反射系列的第六篇，我们学习如何在真实项目中应用反射。读完你会理解：

- 如何实现简单的序列化框架
- 如何实现 ORM 框架基础
- 如何实现依赖注入容器
- 如何实现插件系统
- 综合案例：完整的数据访问层

---

## 1. 序列化框架实现

### 定义序列化特性

```csharp
[AttributeUsage(AttributeTargets.Class)]
public class SerializableAttribute : Attribute
{
    public string Name { get; set; }
}

[AttributeUsage(AttributeTargets.Property)]
public class SerializePropertyAttribute : Attribute
{
    public string Name { get; set; }
    public bool Ignore { get; set; }

    public SerializePropertyAttribute(string name = null)
    {
        Name = name;
    }
}
```

### 实现 JSON 序列化器

```csharp
public class SimpleJsonSerializer
{
    public string Serialize(object obj)
    {
        if (obj == null)
            return "null";

        Type type = obj.GetType();

        // 处理基本类型
        if (type.IsPrimitive || type == typeof(string) || type == typeof(decimal))
        {
            return SerializeValue(obj);
        }

        // 处理集合
        if (typeof(System.Collections.IEnumerable).IsAssignableFrom(type) && type != typeof(string))
        {
            return SerializeCollection(obj);
        }

        // 处理对象
        return SerializeObject(obj);
    }

    private string SerializeValue(object value)
    {
        if (value == null)
            return "null";

        if (value is string str)
            return $"\"{EscapeString(str)}\"";

        if (value is bool b)
            return b.ToString().ToLower();

        return value.ToString();
    }

    private string SerializeCollection(object collection)
    {
        var items = new List<string>();
        foreach (var item in (System.Collections.IEnumerable)collection)
        {
            items.Add(Serialize(item));
        }
        return $"[{string.Join(",", items)}]";
    }

    private string SerializeObject(object obj)
    {
        Type type = obj.GetType();
        var items = new List<string>();

        PropertyInfo[] properties = type.GetProperties();
        foreach (var prop in properties)
        {
            // 检查是否忽略
            var ignoreAttr = (SerializePropertyAttribute)Attribute.GetCustomAttribute(prop, typeof(SerializePropertyAttribute));
            if (ignoreAttr?.Ignore == true)
                continue;

            object value = prop.GetValue(obj);
            string propName = ignoreAttr?.Name ?? prop.Name;
            items.Add($"\"{propName}\":{Serialize(value)}");
        }

        return $"{{{string.Join(",", items)}}}";
    }

    private string EscapeString(string str)
    {
        return str.Replace("\\", "\\\\")
                  .Replace("\"", "\\\"")
                  .Replace("\n", "\\n")
                  .Replace("\r", "\\r");
    }
}

// 使用
[Serializable]
public class Product
{
    [SerializeProperty("product_name")]
    public string Name { get; set; }

    [SerializeProperty]
    public decimal Price { get; set; }

    [SerializeProperty(Ignore = true)]
    public string InternalId { get; set; }
}

var product = new Product 
{ 
    Name = "Laptop", 
    Price = 999.99m, 
    InternalId = "INT-123" 
};

var serializer = new SimpleJsonSerializer();
string json = serializer.Serialize(product);
Console.WriteLine(json);
// 输出: {"product_name":"Laptop","Price":999.99}
```

---

## 2. ORM 框架基础

### 定义 ORM 特性

```csharp
[AttributeUsage(AttributeTargets.Class)]
public class TableAttribute : Attribute
{
    public string Name { get; set; }

    public TableAttribute(string name)
    {
        Name = name;
    }
}

[AttributeUsage(AttributeTargets.Property)]
public class ColumnAttribute : Attribute
{
    public string Name { get; set; }
    public bool IsPrimaryKey { get; set; }
    public bool IsAutoIncrement { get; set; }
    public int? MaxLength { get; set; }

    public ColumnAttribute(string name = null)
    {
        Name = name;
    }
}
```

### 实现 SQL 生成器

```csharp
public class SqlGenerator
{
    public static string GenerateCreateTableSql(Type type)
    {
        var tableAttr = (TableAttribute)Attribute.GetCustomAttribute(type, typeof(TableAttribute));
        string tableName = tableAttr?.Name ?? type.Name;

        var columns = new List<string>();
        PropertyInfo[] properties = type.GetProperties();

        foreach (var prop in properties)
        {
            var columnAttr = (ColumnAttribute)Attribute.GetCustomAttribute(prop, typeof(ColumnAttribute));
            string columnName = columnAttr?.Name ?? prop.Name;
            string columnType = GetSqlType(prop.PropertyType, columnAttr);

            var columnDef = $"{columnName} {columnType}";

            if (columnAttr?.IsPrimaryKey == true)
                columnDef += " PRIMARY KEY";

            if (columnAttr?.IsAutoIncrement == true)
                columnDef += " AUTOINCREMENT";

            if (prop.PropertyType == typeof(string) && columnAttr?.MaxLength.HasValue == true)
                columnDef = columnDef.Replace(columnType, $"VARCHAR({columnAttr.MaxLength})");

            columns.Add(columnDef);
        }

        return $"CREATE TABLE {tableName} ({string.Join(", ", columns)})";
    }

    public static string GenerateInsertSql(object obj)
    {
        Type type = obj.GetType();
        var tableAttr = (TableAttribute)Attribute.GetCustomAttribute(type, typeof(TableAttribute));
        string tableName = tableAttr?.Name ?? type.Name;

        var columns = new List<string>();
        var values = new List<string>();

        PropertyInfo[] properties = type.GetProperties();
        foreach (var prop in properties)
        {
            var columnAttr = (ColumnAttribute)Attribute.GetCustomAttribute(prop, typeof(ColumnAttribute));
            
            // 跳过自增主键
            if (columnAttr?.IsAutoIncrement == true)
                continue;

            string columnName = columnAttr?.Name ?? prop.Name;
            columns.Add(columnName);

            object value = prop.GetValue(obj);
            values.Add(FormatValue(value));
        }

        return $"INSERT INTO {tableName} ({string.Join(", ", columns)}) VALUES ({string.Join(", ", values)})";
    }

    public static string GenerateUpdateSql(object obj)
    {
        Type type = obj.GetType();
        var tableAttr = (TableAttribute)Attribute.GetCustomAttribute(type, typeof(TableAttribute));
        string tableName = tableAttr?.Name ?? type.Name;

        var setParts = new List<string>();
        string whereClause = "";

        PropertyInfo[] properties = type.GetProperties();
        foreach (var prop in properties)
        {
            var columnAttr = (ColumnAttribute)Attribute.GetCustomAttribute(prop, typeof(ColumnAttribute));
            string columnName = columnAttr?.Name ?? prop.Name;
            object value = prop.GetValue(obj);

            if (columnAttr?.IsPrimaryKey == true)
            {
                whereClause = $"WHERE {columnName} = {FormatValue(value)}";
            }
            else
            {
                setParts.Add($"{columnName} = {FormatValue(value)}");
            }
        }

        return $"UPDATE {tableName} SET {string.Join(", ", setParts)} {whereClause}";
    }

    public static string GenerateSelectSql(Type type)
    {
        var tableAttr = (TableAttribute)Attribute.GetCustomAttribute(type, typeof(TableAttribute));
        string tableName = tableAttr?.Name ?? type.Name;

        var columns = new List<string>();
        PropertyInfo[] properties = type.GetProperties();

        foreach (var prop in properties)
        {
            var columnAttr = (ColumnAttribute)Attribute.GetCustomAttribute(prop, typeof(ColumnAttribute));
            string columnName = columnAttr?.Name ?? prop.Name;
            columns.Add(columnName);
        }

        return $"SELECT {string.Join(", ", columns)} FROM {tableName}";
    }

    private static string GetSqlType(Type type, ColumnAttribute attr)
    {
        if (type == typeof(int))
            return "INT";
        if (type == typeof(long))
            return "BIGINT";
        if (type == typeof(decimal))
            return "DECIMAL(18,2)";
        if (type == typeof(bool))
            return "BIT";
        if (type == typeof(DateTime))
            return "DATETIME";
        if (type == typeof(string))
            return attr?.MaxLength.HasValue == true ? $"VARCHAR({attr.MaxLength})" : "VARCHAR(255)";
        return "VARCHAR(255)";
    }

    private static string FormatValue(object value)
    {
        if (value == null)
            return "NULL";
        if (value is string str)
            return $"'{str.Replace("'", "''")}'";
        if (value is bool b)
            return b ? "1" : "0";
        if (value is DateTime dt)
            return $"'{dt:yyyy-MM-dd HH:mm:ss}'";
        return value.ToString();
    }
}

// 使用
[Table("users")]
public class User
{
    [Column("id", IsPrimaryKey = true, IsAutoIncrement = true)]
    public int Id { get; set; }

    [Column("username", MaxLength = 50)]
    public string Username { get; set; }

    [Column("email", MaxLength = 100)]
    public string Email { get; set; }

    [Column("age")]
    public int Age { get; set; }
}

// 生成 SQL
Console.WriteLine(SqlGenerator.GenerateCreateTableSql(typeof(User)));
// 输出: CREATE TABLE users (id INT PRIMARY KEY AUTOINCREMENT, username VARCHAR(50), email VARCHAR(100), age INT)

var user = new User { Id = 1, Username = "alice", Email = "alice@example.com", Age = 30 };
Console.WriteLine(SqlGenerator.GenerateInsertSql(user));
// 输出: INSERT INTO users (username, email, age) VALUES ('alice', 'alice@example.com', 30)
```

---

## 3. 依赖注入容器

### 定义 DI 特性

```csharp
[AttributeUsage(AttributeTargets.Class)]
public class SingletonAttribute : Attribute { }

[AttributeUsage(AttributeTargets.Class)]
public class TransientAttribute : Attribute { }

[AttributeUsage(AttributeTargets.Parameter | AttributeTargets.Property)]
public class InjectAttribute : Attribute { }
```

### 实现 IoC 容器

```csharp
public class ServiceContainer
{
    private readonly Dictionary<Type, ServiceDescriptor> _services = new();

    public class ServiceDescriptor
    {
        public Type ServiceType { get; set; }
        public Type ImplementationType { get; set; }
        public ServiceLifetime Lifetime { get; set; }
        public object SingletonInstance { get; set; }
    }

    public enum ServiceLifetime
    {
        Transient,
        Singleton
    }

    // 注册服务
    public void Register<TInterface, TImplementation>(ServiceLifetime lifetime = ServiceLifetime.Transient)
        where TImplementation : TInterface
    {
        var descriptor = new ServiceDescriptor
        {
            ServiceType = typeof(TInterface),
            ImplementationType = typeof(TImplementation),
            Lifetime = lifetime
        };

        _services[typeof(TInterface)] = descriptor;
    }

    // 自动扫描并注册
    public void RegisterAssembly(Assembly assembly)
    {
        Type[] types = assembly.GetTypes();

        foreach (var type in types)
        {
            // 检查 Singleton 特性
            if (Attribute.IsDefined(type, typeof(SingletonAttribute)))
            {
                var interfaces = type.GetInterfaces();
                if (interfaces.Length > 0)
                {
                    var descriptor = new ServiceDescriptor
                    {
                        ServiceType = interfaces[0],
                        ImplementationType = type,
                        Lifetime = ServiceLifetime.Singleton
                    };
                    _services[interfaces[0]] = descriptor;
                }
            }

            // 检查 Transient 特性
            if (Attribute.IsDefined(type, typeof(TransientAttribute)))
            {
                var interfaces = type.GetInterfaces();
                if (interfaces.Length > 0)
                {
                    var descriptor = new ServiceDescriptor
                    {
                        ServiceType = interfaces[0],
                        ImplementationType = type,
                        Lifetime = ServiceLifetime.Transient
                    };
                    _services[interfaces[0]] = descriptor;
                }
            }
        }
    }

    // 解析服务
    public T Resolve<T>() where T : class
    {
        return (T)Resolve(typeof(T));
    }

    public object Resolve(Type serviceType)
    {
        if (!_services.TryGetValue(serviceType, out var descriptor))
            throw new InvalidOperationException($"服务 {serviceType.Name} 未注册");

        // 单例模式
        if (descriptor.Lifetime == ServiceLifetime.Singleton)
        {
            if (descriptor.SingletonInstance == null)
            {
                descriptor.SingletonInstance = CreateInstance(descriptor.ImplementationType);
            }
            return descriptor.SingletonInstance;
        }

        // 瞬时模式
        return CreateInstance(descriptor.ImplementationType);
    }

    private object CreateInstance(Type type)
    {
        // 获取构造函数
        ConstructorInfo[] constructors = type.GetConstructors();
        if (constructors.Length == 0)
            return Activator.CreateInstance(type);

        // 选择参数最多的构造函数
        ConstructorInfo ctor = constructors.OrderByDescending(c => c.GetParameters().Length).First();

        // 解析构造函数参数
        ParameterInfo[] parameters = ctor.GetParameters();
        object[] paramValues = new object[parameters.Length];

        for (int i = 0; i < parameters.Length; i++)
        {
            paramValues[i] = Resolve(parameters[i].ParameterType);
        }

        return ctor.Invoke(paramValues);
    }
}

// 使用
public interface ILogger
{
    void Log(string message);
}

[Singleton]
public class ConsoleLogger : ILogger
{
    public void Log(string message) => Console.WriteLine($"[LOG] {message}");
}

public interface IUserService
{
    void CreateUser(string name);
}

[Transient]
public class UserService : IUserService
{
    private readonly ILogger _logger;

    public UserService(ILogger logger)
    {
        _logger = logger;
    }

    public void CreateUser(string name)
    {
        _logger.Log($"创建用户: {name}");
    }
}

// 使用容器
var container = new ServiceContainer();
container.Register<ILogger, ConsoleLogger>(ServiceContainer.ServiceLifetime.Singleton);
container.Register<IUserService, UserService>();

var userService = container.Resolve<IUserService>();
userService.CreateUser("Alice"); // [LOG] 创建用户: Alice
```

---

## 4. 插件系统

### 定义插件接口

```csharp
public interface IPlugin
{
    string Name { get; }
    string Version { get; }
    void Initialize();
    void Execute();
}

[AttributeUsage(AttributeTargets.Class)]
public class PluginAttribute : Attribute
{
    public string Name { get; set; }
    public string Version { get; set; }

    public PluginAttribute(string name, string version)
    {
        Name = name;
        Version = version;
    }
}
```

### 实现插件加载器

```csharp
public class PluginLoader
{
    private readonly List<IPlugin> _plugins = new();

    public void LoadPluginsFromDirectory(string directory)
    {
        if (!Directory.Exists(directory))
            throw new DirectoryNotFoundException($"目录不存在: {directory}");

        string[] dllFiles = Directory.GetFiles(directory, "*.dll");

        foreach (var dllFile in dllFiles)
        {
            try
            {
                Assembly assembly = Assembly.LoadFrom(dllFile);
                LoadPluginsFromAssembly(assembly);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"加载程序集失败: {dllFile}, 错误: {ex.Message}");
            }
        }
    }

    public void LoadPluginsFromAssembly(Assembly assembly)
    {
        Type[] types = assembly.GetTypes();

        foreach (var type in types)
        {
            // 检查是否实现 IPlugin 接口
            if (!typeof(IPlugin).IsAssignableFrom(type) || type.IsInterface)
                continue;

            // 检查是否有 Plugin 特性
            var pluginAttr = (PluginAttribute)Attribute.GetCustomAttribute(type, typeof(PluginAttribute));
            if (pluginAttr == null)
                continue;

            try
            {
                IPlugin plugin = (IPlugin)Activator.CreateInstance(type);
                plugin.Initialize();
                _plugins.Add(plugin);
                Console.WriteLine($"插件已加载: {plugin.Name} v{plugin.Version}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"加载插件失败: {type.Name}, 错误: {ex.Message}");
            }
        }
    }

    public void ExecuteAllPlugins()
    {
        foreach (var plugin in _plugins)
        {
            try
            {
                plugin.Execute();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"执行插件失败: {plugin.Name}, 错误: {ex.Message}");
            }
        }
    }

    public IEnumerable<IPlugin> GetPlugins() => _plugins;
}

// 使用
[Plugin("HelloPlugin", "1.0")]
public class HelloPlugin : IPlugin
{
    public string Name => "Hello Plugin";
    public string Version => "1.0";

    public void Initialize()
    {
        Console.WriteLine("Hello Plugin 已初始化");
    }

    public void Execute()
    {
        Console.WriteLine("Hello Plugin 正在执行");
    }
}

var loader = new PluginLoader();
loader.LoadPluginsFromDirectory("./plugins");
loader.ExecuteAllPlugins();
```

---

## 5. 综合案例：完整的数据访问层

```csharp
public class Repository<T> where T : class
{
    private readonly string _connectionString;

    public Repository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public void Create(T entity)
    {
        string sql = SqlGenerator.GenerateInsertSql(entity);
        Console.WriteLine($"执行 SQL: {sql}");
        // 实际执行 SQL...
    }

    public void Update(T entity)
    {
        string sql = SqlGenerator.GenerateUpdateSql(entity);
        Console.WriteLine($"执行 SQL: {sql}");
        // 实际执行 SQL...
    }

    public List<T> GetAll()
    {
        string sql = SqlGenerator.GenerateSelectSql(typeof(T));
        Console.WriteLine($"执行 SQL: {sql}");
        // 实际执行 SQL 并映射结果...
        return new List<T>();
    }

    public T GetById(int id)
    {
        string sql = $"{SqlGenerator.GenerateSelectSql(typeof(T))} WHERE id = {id}";
        Console.WriteLine($"执行 SQL: {sql}");
        // 实际执行 SQL 并映射结果...
        return null;
    }
}

// 使用
var userRepo = new Repository<User>("Server=localhost;Database=mydb");

var newUser = new User 
{ 
    Username = "alice", 
    Email = "alice@example.com", 
    Age = 30 
};

userRepo.Create(newUser);
// 输出: 执行 SQL: INSERT INTO users (username, email, age) VALUES ('alice', 'alice@example.com', 30)

var users = userRepo.GetAll();
// 输出: 执行 SQL: SELECT id, username, email, age FROM users
```

---

## 6. 最佳实践

### 性能优化

```csharp
// 1. 缓存反射结果
private static readonly Dictionary<Type, PropertyInfo[]> _propertyCache = new();

public static PropertyInfo[] GetCachedProperties(Type type)
{
    if (!_propertyCache.TryGetValue(type, out var props))
    {
        props = type.GetProperties();
        _propertyCache[type] = props;
    }
    return props;
}

// 2. 使用表达式树替代反射
// 见第五篇内容

// 3. 避免在热路径中进行反射
// 在初始化时进行反射，运行时使用缓存的结果
```

### 错误处理

```csharp
public class SafeReflectionHelper
{
    public static object GetPropertyValue(object obj, string propertyName)
    {
        try
        {
            PropertyInfo prop = obj.GetType().GetProperty(propertyName);
            if (prop == null)
                return null;

            return prop.GetValue(obj);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"获取属性值失败: {ex.Message}");
            return null;
        }
    }

    public static bool SetPropertyValue(object obj, string propertyName, object value)
    {
        try
        {
            PropertyInfo prop = obj.GetType().GetProperty(propertyName);
            if (prop == null || !prop.CanWrite)
                return false;

            prop.SetValue(obj, value);
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"设置属性值失败: {ex.Message}");
            return false;
        }
    }
}
```

---

## 总结

反射在以下场景中非常有用：

| 场景 | 示例 |
|------|------|
| **序列化/反序列化** | JSON、XML、Protocol Buffers |
| **ORM 框架** | Entity Framework、Dapper |
| **依赖注入** | Autofac、Ninject、Microsoft.Extensions.DependencyInjection |
| **插件系统** | 动态加载程序集 |
| **单元测试** | 自动发现测试方法 |
| **API 框架** | ASP.NET Core 路由、控制器发现 |
| **数据验证** | 特性验证 |

### 关键要点

1. **充分利用特性**：为代码添加元数据
2. **缓存反射结果**：避免重复反射
3. **考虑性能**：在必要时使用表达式树
4. **错误处理**：反射操作可能失败
5. **文档化**：清楚地说明反射的用途

这就是 C# 反射系列的全部内容。希望你现在对反射有了深入的理解！
