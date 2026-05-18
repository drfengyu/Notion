---
title: C# 反射由浅入深 (3) — 特性（Attributes）
date: 2026-05-18
tags:
  - C#
  - 反射
  - Reflection
  - 特性
  - Attributes
categories:
  - C# 反射系列
---

## 本篇定位

这是 C# 反射系列的第三篇，我们学习**特性（Attributes）**的定义和使用。读完你会理解：

- 什么是特性，为什么需要特性
- 如何定义自定义特性
- 如何通过反射获取特性
- 特性的应用场景
- 实战例子：数据验证框架

---

## 1. 什么是特性

**特性（Attribute）** 是一种声明式编程机制，用于向代码添加元数据。特性本身不影响代码逻辑，但可以通过反射在运行时被读取和处理。

### 内置特性示例

```csharp
// [Obsolete] 特性：标记过时的成员
[Obsolete("使用 NewMethod 替代")]
public void OldMethod() { }

// [Serializable] 特性：标记可序列化的类
[Serializable]
public class Person { }

// [Conditional] 特性：条件编译
[System.Diagnostics.Conditional("DEBUG")]
public void DebugLog(string message) { }

// [Flags] 特性：标记枚举为位标志
[Flags]
public enum Permissions
{
    Read = 1,
    Write = 2,
    Execute = 4
}
```

### 为什么需要特性

- **元数据标注**：为代码添加额外信息
- **框架支持**：ORM、序列化、验证等框架使用特性
- **代码生成**：编译器或工具根据特性生成代码
- **运行时处理**：通过反射读取特性并执行相应逻辑

---

## 2. 定义自定义特性

### 基本特性

```csharp
// 定义特性（必须继承 Attribute）
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class AuthorAttribute : Attribute
{
    public string Name { get; set; }
    public string Date { get; set; }

    public AuthorAttribute(string name)
    {
        Name = name;
    }
}

// 使用特性
[Author("Alice", Date = "2026-05-18")]
public class MyClass
{
    [Author("Bob")]
    public void MyMethod() { }
}
```

### AttributeUsage 详解

`AttributeUsage` 控制特性的使用范围：

```csharp
[AttributeUsage(
    AttributeTargets.Class,           // 只能用于类
    AllowMultiple = false,            // 不允许多次应用
    Inherited = true                  // 继承时保留特性
)]
public class SingleUseAttribute : Attribute { }

// AttributeTargets 的常见值：
// - Class：类
// - Method：方法
// - Property：属性
// - Field：字段
// - Parameter：参数
// - All：所有目标
```

### 特性的参数

```csharp
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class DocumentationAttribute : Attribute
{
    // 位置参数（必须）
    public string Description { get; }

    // 命名参数（可选）
    public string Author { get; set; }
    public string Version { get; set; }
    public bool IsDeprecated { get; set; }

    public DocumentationAttribute(string description)
    {
        Description = description;
    }
}

// 使用
[Documentation(
    "用户管理类",
    Author = "Alice",
    Version = "1.0",
    IsDeprecated = false
)]
public class UserManager { }
```

### 特性继承

```csharp
[AttributeUsage(AttributeTargets.Class, Inherited = true)]
public class BaseAttribute : Attribute
{
    public string Value { get; set; }
}

[BaseAttribute(Value = "base")]
public class Parent { }

public class Child : Parent { }

// Child 继承了 BaseAttribute
```

---

## 3. 获取特性

### 获取类型上的特性

```csharp
[Author("Alice")]
[Documentation("示例类")]
public class Example { }

Type type = typeof(Example);

// 获取所有特性
Attribute[] attributes = Attribute.GetCustomAttributes(type);
foreach (var attr in attributes)
{
    Console.WriteLine($"特性: {attr.GetType().Name}");
}

// 获取特定特性
AuthorAttribute authorAttr = (AuthorAttribute)Attribute.GetCustomAttribute(type, typeof(AuthorAttribute));
if (authorAttr != null)
{
    Console.WriteLine($"作者: {authorAttr.Name}");
}

// 检查是否有特性
bool hasAuthor = Attribute.IsDefined(type, typeof(AuthorAttribute));
Console.WriteLine($"有 Author 特性: {hasAuthor}");
```

### 获取方法上的特性

```csharp
public class Calculator
{
    [Author("Bob")]
    [Documentation("加法方法")]
    public int Add(int a, int b) => a + b;
}

Type type = typeof(Calculator);
MethodInfo method = type.GetMethod("Add");

// 获取方法上的特性
Attribute[] attributes = Attribute.GetCustomAttributes(method);
foreach (var attr in attributes)
{
    Console.WriteLine($"方法特性: {attr.GetType().Name}");
}
```

### 获取属性和参数上的特性

```csharp
public class Product
{
    [Required]
    [MaxLength(100)]
    public string Name { get; set; }

    public void Process([NotNull] string input) { }
}

Type type = typeof(Product);

// 获取属性上的特性
PropertyInfo prop = type.GetProperty("Name");
Attribute[] propAttributes = Attribute.GetCustomAttributes(prop);

// 获取参数上的特性
MethodInfo method = type.GetMethod("Process");
ParameterInfo param = method.GetParameters()[0];
Attribute[] paramAttributes = Attribute.GetCustomAttributes(param);
```

---

## 4. 实战例子：数据验证框架

让我们实现一个简单的验证框架：

### 定义验证特性

```csharp
// 基础验证特性
[AttributeUsage(AttributeTargets.Property)]
public abstract class ValidationAttribute : Attribute
{
    public abstract bool Validate(object value);
    public abstract string GetErrorMessage(string propertyName);
}

// 必填验证
[AttributeUsage(AttributeTargets.Property)]
public class RequiredAttribute : ValidationAttribute
{
    public override bool Validate(object value)
    {
        return value != null && !string.IsNullOrWhiteSpace(value.ToString());
    }

    public override string GetErrorMessage(string propertyName)
    {
        return $"{propertyName} 是必填项";
    }
}

// 长度验证
[AttributeUsage(AttributeTargets.Property)]
public class MaxLengthAttribute : ValidationAttribute
{
    public int MaxLength { get; set; }

    public MaxLengthAttribute(int maxLength)
    {
        MaxLength = maxLength;
    }

    public override bool Validate(object value)
    {
        if (value == null) return true;
        return value.ToString().Length <= MaxLength;
    }

    public override string GetErrorMessage(string propertyName)
    {
        return $"{propertyName} 长度不能超过 {MaxLength}";
    }
}

// 范围验证
[AttributeUsage(AttributeTargets.Property)]
public class RangeAttribute : ValidationAttribute
{
    public int Min { get; set; }
    public int Max { get; set; }

    public RangeAttribute(int min, int max)
    {
        Min = min;
        Max = max;
    }

    public override bool Validate(object value)
    {
        if (value == null) return true;
        if (int.TryParse(value.ToString(), out int intValue))
        {
            return intValue >= Min && intValue <= Max;
        }
        return false;
    }

    public override string GetErrorMessage(string propertyName)
    {
        return $"{propertyName} 必须在 {Min} 到 {Max} 之间";
    }
}

// 正则表达式验证
[AttributeUsage(AttributeTargets.Property)]
public class RegexAttribute : ValidationAttribute
{
    public string Pattern { get; set; }

    public RegexAttribute(string pattern)
    {
        Pattern = pattern;
    }

    public override bool Validate(object value)
    {
        if (value == null) return true;
        return System.Text.RegularExpressions.Regex.IsMatch(value.ToString(), Pattern);
    }

    public override string GetErrorMessage(string propertyName)
    {
        return $"{propertyName} 格式不正确";
    }
}
```

### 定义验证结果

```csharp
public class ValidationResult
{
    public bool IsValid { get; set; }
    public List<string> Errors { get; set; } = new();
}
```

### 实现验证器

```csharp
public class Validator
{
    public static ValidationResult Validate(object obj)
    {
        var result = new ValidationResult { IsValid = true };

        if (obj == null)
            return result;

        Type type = obj.GetType();
        PropertyInfo[] properties = type.GetProperties();

        foreach (var prop in properties)
        {
            // 获取属性上的所有验证特性
            var validationAttrs = Attribute.GetCustomAttributes(prop, typeof(ValidationAttribute));

            foreach (ValidationAttribute attr in validationAttrs)
            {
                object value = prop.GetValue(obj);

                if (!attr.Validate(value))
                {
                    result.IsValid = false;
                    result.Errors.Add(attr.GetErrorMessage(prop.Name));
                }
            }
        }

        return result;
    }
}
```

### 使用验证框架

```csharp
public class User
{
    [Required]
    [MaxLength(50)]
    public string Name { get; set; }

    [Required]
    [Range(18, 120)]
    public int Age { get; set; }

    [Required]
    [Regex(@"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")]
    public string Email { get; set; }
}

// 验证有效的用户
var validUser = new User
{
    Name = "Alice",
    Age = 25,
    Email = "alice@example.com"
};

var result = Validator.Validate(validUser);
Console.WriteLine($"验证结果: {result.IsValid}"); // True

// 验证无效的用户
var invalidUser = new User
{
    Name = "",
    Age = 150,
    Email = "invalid-email"
};

result = Validator.Validate(invalidUser);
Console.WriteLine($"验证结果: {result.IsValid}"); // False
foreach (var error in result.Errors)
{
    Console.WriteLine($"错误: {error}");
}
// 输出:
// 错误: Name 是必填项
// 错误: Age 必须在 18 到 120 之间
// 错误: Email 格式不正确
```

---

## 5. 实战例子：ORM 映射特性

```csharp
// 定义 ORM 特性
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

    public ColumnAttribute(string name = null)
    {
        Name = name;
    }
}

// 使用 ORM 特性
[Table("users")]
public class User
{
    [Column("id", IsPrimaryKey = true, IsAutoIncrement = true)]
    public int Id { get; set; }

    [Column("username")]
    public string Username { get; set; }

    [Column("email")]
    public string Email { get; set; }
}

// 生成 SQL
public class SqlGenerator
{
    public static string GenerateSelectSql(Type type)
    {
        var tableAttr = (TableAttribute)Attribute.GetCustomAttribute(type, typeof(TableAttribute));
        string tableName = tableAttr?.Name ?? type.Name;

        var properties = type.GetProperties();
        var columns = new List<string>();

        foreach (var prop in properties)
        {
            var columnAttr = (ColumnAttribute)Attribute.GetCustomAttribute(prop, typeof(ColumnAttribute));
            string columnName = columnAttr?.Name ?? prop.Name;
            columns.Add(columnName);
        }

        return $"SELECT {string.Join(", ", columns)} FROM {tableName}";
    }
}

// 使用
string sql = SqlGenerator.GenerateSelectSql(typeof(User));
Console.WriteLine(sql);
// 输出: SELECT id, username, email FROM users
```

---

## 6. 特性的应用场景

| 场景 | 示例 |
|------|------|
| **数据验证** | Required、MaxLength、Range、Regex |
| **ORM 映射** | Table、Column、ForeignKey |
| **序列化** | JsonProperty、XmlElement |
| **依赖注入** | Inject、Singleton、Transient |
| **权限控制** | Authorize、RequireRole |
| **API 文档** | ApiController、ApiOperation |
| **性能监控** | Cacheable、Timeout |
| **代码生成** | GenerateCode、Template |

---

## 7. 性能考虑

### 缓存特性

```csharp
public class AttributeCache
{
    private static readonly Dictionary<Type, Attribute[]> _cache = new();

    public static Attribute[] GetAttributes(Type type)
    {
        if (!_cache.ContainsKey(type))
        {
            _cache[type] = Attribute.GetCustomAttributes(type);
        }
        return _cache[type];
    }
}

// 使用缓存
var attrs = AttributeCache.GetAttributes(typeof(User));
```

### 避免频繁反射

```csharp
// ❌ 不好：每次都反射
for (int i = 0; i < 1000; i++)
{
    var result = Validator.Validate(user);
}

// ✅ 好：缓存验证规则
var validationRules = BuildValidationRules(typeof(User));
for (int i = 0; i < 1000; i++)
{
    var result = ValidateWithRules(user, validationRules);
}
```

---

## 总结

- **特性** 是向代码添加元数据的声明式机制
- **定义特性**：继承 `Attribute`，使用 `AttributeUsage` 控制范围
- **获取特性**：使用 `Attribute.GetCustomAttributes` 等方法
- **应用场景**：验证、ORM、序列化、权限控制等
- **性能**：缓存特性和验证规则以提高效率

下一篇我们将学习**泛型反射**的处理方法。
