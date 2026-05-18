---
title: C# 反射由浅入深 (2) — 动态调用
date: 2026-05-18
tags:
  - C#
  - 反射
  - Reflection
  - 动态调用
categories:
  - C# 反射系列
---

## 本篇定位

这是 C# 反射系列的第二篇，我们学习如何通过反射**动态调用方法和访问属性**。读完你会理解：

- 如何通过反射创建实例
- 如何动态调用方法
- 如何动态读写属性和字段
- 如何处理参数和返回值
- 反射调用的性能特点

---

## 1. 创建实例

### 使用 Activator.CreateInstance

最简单的方式是使用 `Activator.CreateInstance`：

```csharp
public class Person
{
    public string Name { get; set; }
    public int Age { get; set; }
    
    public Person() { }
    public Person(string name, int age)
    {
        Name = name;
        Age = age;
    }
}

// 调用无参构造函数
object instance1 = Activator.CreateInstance(typeof(Person));
Console.WriteLine(instance1 is Person); // True

// 调用有参构造函数
object instance2 = Activator.CreateInstance(typeof(Person), "Alice", 30);
var person = (Person)instance2;
Console.WriteLine($"{person.Name}, {person.Age}"); // Alice, 30

// 泛型版本（避免装箱）
Person instance3 = Activator.CreateInstance<Person>();
```

### 使用 ConstructorInfo

更细粒度的控制：

```csharp
Type type = typeof(Person);

// 获取无参构造函数
ConstructorInfo ctor1 = type.GetConstructor(Type.EmptyTypes);
object instance1 = ctor1.Invoke(null);

// 获取有参构造函数
ConstructorInfo ctor2 = type.GetConstructor(new[] { typeof(string), typeof(int) });
object instance2 = ctor2.Invoke(new object[] { "Bob", 25 });

// 列出所有构造函数
ConstructorInfo[] constructors = type.GetConstructors();
foreach (var ctor in constructors)
{
    var parameters = string.Join(", ", ctor.GetParameters().Select(p => p.ParameterType.Name));
    Console.WriteLine($"构造函数: Person({parameters})");
}
```

---

## 2. 动态调用方法

### 基本调用

```csharp
public class Calculator
{
    public int Add(int a, int b) => a + b;
    public int Multiply(int a, int b) => a * b;
    public void PrintResult(int result) => Console.WriteLine($"结果: {result}");
}

Type type = typeof(Calculator);
object calc = Activator.CreateInstance(type);

// 获取方法
MethodInfo addMethod = type.GetMethod("Add");

// 调用方法
object result = addMethod.Invoke(calc, new object[] { 5, 3 });
Console.WriteLine(result); // 8

// 调用无返回值的方法
MethodInfo printMethod = type.GetMethod("PrintResult");
printMethod.Invoke(calc, new object[] { 42 });
// 输出: 结果: 42
```

### 处理参数

```csharp
public class StringHelper
{
    public string Concat(string a, string b) => a + b;
    public string Repeat(string text, int count) => string.Concat(Enumerable.Repeat(text, count));
    public void ModifyByRef(ref int value) => value *= 2;
}

Type type = typeof(StringHelper);
object helper = Activator.CreateInstance(type);

// 普通参数
MethodInfo concatMethod = type.GetMethod("Concat");
object result = concatMethod.Invoke(helper, new object[] { "Hello", "World" });
Console.WriteLine(result); // HelloWorld

// 多个参数
MethodInfo repeatMethod = type.GetMethod("Repeat");
object result2 = repeatMethod.Invoke(helper, new object[] { "ab", 3 });
Console.WriteLine(result2); // ababab

// ref 参数
MethodInfo refMethod = type.GetMethod("ModifyByRef");
object[] parameters = new object[] { 10 };
refMethod.Invoke(helper, parameters);
Console.WriteLine(parameters[0]); // 20（ref 参数被修改）
```

### 调用静态方法

```csharp
public class MathHelper
{
    public static int Square(int x) => x * x;
    public static double Pi => Math.PI;
}

Type type = typeof(MathHelper);

// 调用静态方法（第一个参数传 null）
MethodInfo squareMethod = type.GetMethod("Square");
object result = squareMethod.Invoke(null, new object[] { 5 });
Console.WriteLine(result); // 25
```

### 调用泛型方法

```csharp
public class GenericHelper
{
    public T GetDefault<T>() => default(T);
    public T[] CreateArray<T>(int length) => new T[length];
}

Type type = typeof(GenericHelper);
object helper = Activator.CreateInstance(type);

// 获取泛型方法
MethodInfo method = type.GetMethod("GetDefault");

// 指定泛型参数
MethodInfo genericMethod = method.MakeGenericMethod(typeof(int));
object result = genericMethod.Invoke(helper, null);
Console.WriteLine(result); // 0

// 创建数组
MethodInfo arrayMethod = type.GetMethod("CreateArray");
MethodInfo genericArrayMethod = arrayMethod.MakeGenericMethod(typeof(string));
object result2 = genericArrayMethod.Invoke(helper, new object[] { 3 });
Console.WriteLine(((string[])result2).Length); // 3
```

---

## 3. 动态访问属性

### 读取属性

```csharp
public class Product
{
    public string Name { get; set; }
    public decimal Price { get; set; }
}

Type type = typeof(Product);
var product = new Product { Name = "Laptop", Price = 999.99m };

// 获取属性值
PropertyInfo nameProp = type.GetProperty("Name");
object nameValue = nameProp.GetValue(product);
Console.WriteLine(nameValue); // Laptop

PropertyInfo priceProp = type.GetProperty("Price");
object priceValue = priceProp.GetValue(product);
Console.WriteLine(priceValue); // 999.99
```

### 设置属性

```csharp
Type type = typeof(Product);
var product = new Product();

// 设置属性值
PropertyInfo nameProp = type.GetProperty("Name");
nameProp.SetValue(product, "Phone");

PropertyInfo priceProp = type.GetProperty("Price");
priceProp.SetValue(product, 599.99m);

Console.WriteLine($"{product.Name}: {product.Price}"); // Phone: 599.99
```

### 处理只读属性

```csharp
public class ReadOnlyExample
{
    public string Id { get; } = Guid.NewGuid().ToString();
    public string Name { get; set; }
}

Type type = typeof(ReadOnlyExample);
var obj = new ReadOnlyExample();

PropertyInfo idProp = type.GetProperty("Id");
Console.WriteLine(idProp.CanRead);   // True
Console.WriteLine(idProp.CanWrite);  // False

// 尝试设置只读属性会抛异常
try
{
    idProp.SetValue(obj, "new-id");
}
catch (TargetParameterCountException ex)
{
    Console.WriteLine("无法设置只读属性");
}
```

---

## 4. 动态访问字段

### 读写字段

```csharp
public class Config
{
    public string ApiKey = "secret123";
    private int _timeout = 5000;
}

Type type = typeof(Config);
var config = new Config();

// 读取公开字段
FieldInfo apiKeyField = type.GetField("ApiKey");
object apiKey = apiKeyField.GetValue(config);
Console.WriteLine(apiKey); // secret123

// 修改公开字段
apiKeyField.SetValue(config, "new-secret");
Console.WriteLine(config.ApiKey); // new-secret

// 访问私有字段
FieldInfo timeoutField = type.GetField("_timeout", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
object timeout = timeoutField.GetValue(config);
Console.WriteLine(timeout); // 5000

timeoutField.SetValue(config, 10000);
Console.WriteLine(config._timeout); // 10000（如果是公开的话）
```

---

## 5. 实战例子：通用对象复制器

让我们写一个通过反射实现的对象复制工具：

```csharp
public class ObjectCloner
{
    public static T Clone<T>(T source) where T : class
    {
        if (source == null)
            return null;

        Type type = source.GetType();
        T target = (T)Activator.CreateInstance(type);

        // 复制所有属性
        PropertyInfo[] properties = type.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
        foreach (var prop in properties)
        {
            if (prop.CanRead && prop.CanWrite)
            {
                object value = prop.GetValue(source);
                prop.SetValue(target, value);
            }
        }

        // 复制所有字段
        FieldInfo[] fields = type.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
        foreach (var field in fields)
        {
            object value = field.GetValue(source);
            field.SetValue(target, value);
        }

        return target;
    }
}

// 使用
var original = new Person { Name = "Alice", Age = 30 };
var cloned = ObjectCloner.Clone(original);

cloned.Name = "Bob";
Console.WriteLine($"原始: {original.Name}"); // Alice
Console.WriteLine($"克隆: {cloned.Name}");   // Bob
```

---

## 6. 实战例子：简单的 ORM 查询映射

```csharp
public class DataMapper
{
    public static T MapFromDictionary<T>(Dictionary<string, object> data) where T : class, new()
    {
        T instance = new T();
        Type type = typeof(T);

        foreach (var kvp in data)
        {
            PropertyInfo prop = type.GetProperty(kvp.Key, System.Reflection.BindingFlags.IgnoreCase | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            if (prop != null && prop.CanWrite)
            {
                try
                {
                    object value = Convert.ChangeType(kvp.Value, prop.PropertyType);
                    prop.SetValue(instance, value);
                }
                catch
                {
                    // 类型转换失败，跳过
                }
            }
        }

        return instance;
    }
}

// 使用
var data = new Dictionary<string, object>
{
    { "Name", "Charlie" },
    { "Age", 28 }
};

var person = DataMapper.MapFromDictionary<Person>(data);
Console.WriteLine($"{person.Name}, {person.Age}"); // Charlie, 28
```

---

## 7. 性能考虑

### 反射的性能开销

```csharp
public class PerformanceTest
{
    public static void Main()
    {
        var person = new Person { Name = "Test", Age = 25 };
        const int iterations = 1_000_000;

        // 直接调用
        var sw = System.Diagnostics.Stopwatch.StartNew();
        for (int i = 0; i < iterations; i++)
        {
            var name = person.Name;
        }
        sw.Stop();
        Console.WriteLine($"直接访问: {sw.ElapsedMilliseconds}ms");

        // 反射调用
        Type type = typeof(Person);
        PropertyInfo prop = type.GetProperty("Name");
        sw.Restart();
        for (int i = 0; i < iterations; i++)
        {
            var name = prop.GetValue(person);
        }
        sw.Stop();
        Console.WriteLine($"反射访问: {sw.ElapsedMilliseconds}ms");
    }
}

// 输出示例:
// 直接访问: 2ms
// 反射访问: 150ms
```

### 性能优化建议

1. **缓存 Type、PropertyInfo、MethodInfo**
   ```csharp
   // ❌ 不好：每次都获取
   for (int i = 0; i < 1000; i++)
   {
       var prop = typeof(Person).GetProperty("Name");
       prop.GetValue(person);
   }

   // ✅ 好：缓存 PropertyInfo
   PropertyInfo prop = typeof(Person).GetProperty("Name");
   for (int i = 0; i < 1000; i++)
   {
       prop.GetValue(person);
   }
   ```

2. **使用表达式树替代反射**
   ```csharp
   // 反射速度慢，但表达式树可以编译成高效的代码
   // 这是下一篇的内容
   ```

3. **避免频繁的反射调用**
   - 在初始化时使用反射
   - 在热路径中使用缓存或编译的委托

---

## 总结

- **创建实例**：使用 `Activator.CreateInstance` 或 `ConstructorInfo.Invoke`
- **调用方法**：使用 `MethodInfo.Invoke`，注意处理参数和返回值
- **访问属性**：使用 `PropertyInfo.GetValue/SetValue`
- **访问字段**：使用 `FieldInfo.GetValue/SetValue`
- **性能**：反射有开销，需要缓存元数据
- **应用**：对象复制、ORM 映射、序列化等

下一篇我们将学习**特性（Attributes）**的定义和使用。
