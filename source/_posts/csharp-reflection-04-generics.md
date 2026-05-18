---
title: C# 反射由浅入深 (4) — 泛型反射
date: 2026-05-18
tags:
  - C#
  - 反射
  - Reflection
  - 泛型
  - Generics
categories:
  - C# 反射系列
---

## 本篇定位

这是 C# 反射系列的第四篇，我们学习如何通过反射处理**泛型类型**。读完你会理解：

- 泛型类型和非泛型类型的区别
- 如何获取泛型参数
- 如何处理泛型方法
- 如何检查泛型约束
- 实战例子：泛型容器序列化

---

## 1. 泛型类型基础

### 开放泛型类型 vs 封闭泛型类型

```csharp
public class Container<T>
{
    public T Value { get; set; }
}

// 开放泛型类型（未指定泛型参数）
Type openType = typeof(Container<>);
Console.WriteLine(openType.Name);           // Container`1
Console.WriteLine(openType.IsGenericTypeDefinition); // True

// 封闭泛型类型（已指定泛型参数）
Type closedType = typeof(Container<string>);
Console.WriteLine(closedType.Name);         // Container`1
Console.WriteLine(closedType.IsGenericTypeDefinition); // False

// 检查是否是泛型类型
Console.WriteLine(openType.IsGenericType);  // True
Console.WriteLine(closedType.IsGenericType); // True
```

### 获取泛型参数

```csharp
public class Pair<T1, T2>
{
    public T1 First { get; set; }
    public T2 Second { get; set; }
}

Type type = typeof(Pair<string, int>);

// 获取泛型参数
Type[] genericArgs = type.GetGenericArguments();
Console.WriteLine($"泛型参数个数: {genericArgs.Length}"); // 2

foreach (var arg in genericArgs)
{
    Console.WriteLine($"泛型参数: {arg.Name}");
}
// 输出:
// 泛型参数: String
// 泛型参数: Int32

// 获取泛型参数定义
Type openType = typeof(Pair<,>);
Type[] genericParams = openType.GetGenericArguments();
Console.WriteLine($"泛型参数定义: {genericParams[0].Name}"); // T1
```

---

## 2. 泛型类型的反射操作

### 创建泛型类型实例

```csharp
public class Box<T>
{
    public T Content { get; set; }
    
    public Box() { }
    public Box(T content)
    {
        Content = content;
    }
}

// 方式 1：使用 typeof 和 Activator
Type boxType = typeof(Box<string>);
object box1 = Activator.CreateInstance(boxType, "Hello");
Console.WriteLine(((Box<string>)box1).Content); // Hello

// 方式 2：从开放泛型类型创建
Type openBoxType = typeof(Box<>);
Type closedBoxType = openBoxType.MakeGenericType(typeof(int));
object box2 = Activator.CreateInstance(closedBoxType, 42);
Console.WriteLine(((Box<int>)box2).Content); // 42

// 方式 3：处理多个泛型参数
Type openPairType = typeof(Pair<,>);
Type closedPairType = openPairType.MakeGenericType(typeof(string), typeof(double));
object pair = Activator.CreateInstance(closedPairType);
Console.WriteLine(pair.GetType().Name); // Pair`2
```

### 访问泛型类型的属性

```csharp
Type type = typeof(Box<string>);
PropertyInfo contentProp = type.GetProperty("Content");

var box = new Box<string> { Content = "Test" };
object value = contentProp.GetValue(box);
Console.WriteLine(value); // Test

contentProp.SetValue(box, "Updated");
Console.WriteLine(box.Content); // Updated
```

---

## 3. 泛型方法的反射

### 获取泛型方法

```csharp
public class GenericMethods
{
    public T GetDefault<T>() => default(T);
    
    public T Convert<T>(object value) => (T)System.Convert.ChangeType(value, typeof(T));
    
    public void Print<T>(T value) => Console.WriteLine($"值: {value}");
    
    public T[] CreateArray<T>(int length) => new T[length];
}

Type type = typeof(GenericMethods);

// 获取泛型方法
MethodInfo method = type.GetMethod("GetDefault");
Console.WriteLine(method.IsGenericMethodDefinition); // True

// 获取泛型参数
Type[] genericParams = method.GetGenericArguments();
Console.WriteLine($"泛型参数个数: {genericParams.Length}"); // 1
```

### 调用泛型方法

```csharp
Type type = typeof(GenericMethods);
object instance = Activator.CreateInstance(type);

// 获取泛型方法
MethodInfo method = type.GetMethod("GetDefault");

// 指定泛型参数并调用
MethodInfo intMethod = method.MakeGenericMethod(typeof(int));
object result1 = intMethod.Invoke(instance, null);
Console.WriteLine(result1); // 0

MethodInfo stringMethod = method.MakeGenericMethod(typeof(string));
object result2 = stringMethod.Invoke(instance, null);
Console.WriteLine(result2); // (null)

// 调用有参数的泛型方法
MethodInfo convertMethod = type.GetMethod("Convert");
MethodInfo intConvertMethod = convertMethod.MakeGenericMethod(typeof(int));
object result3 = intConvertMethod.Invoke(instance, new object[] { "42" });
Console.WriteLine(result3); // 42
```

### 处理多个泛型参数的方法

```csharp
public class MultiGeneric
{
    public TResult Convert<TSource, TResult>(TSource source)
    {
        return (TResult)(object)source;
    }
}

Type type = typeof(MultiGeneric);
object instance = Activator.CreateInstance(type);

MethodInfo method = type.GetMethod("Convert");

// 指定两个泛型参数
MethodInfo specificMethod = method.MakeGenericMethod(typeof(int), typeof(string));
object result = specificMethod.Invoke(instance, new object[] { 42 });
Console.WriteLine(result); // "42"
```

---

## 4. 泛型约束的处理

### 获取泛型约束

```csharp
public class Constrained<T> where T : class, IComparable<T>, new()
{
}

Type type = typeof(Constrained<>);
Type[] genericParams = type.GetGenericArguments();
Type paramT = genericParams[0];

// 获取泛型约束
Type[] constraints = paramT.GetGenericParameterConstraints();
Console.WriteLine($"约束个数: {constraints.Length}");

foreach (var constraint in constraints)
{
    Console.WriteLine($"约束: {constraint.Name}");
}
// 输出:
// 约束: IComparable`1

// 获取泛型参数属性
GenericParameterAttributes attrs = paramT.GenericParameterAttributes;
Console.WriteLine($"是引用类型: {(attrs & GenericParameterAttributes.ReferenceTypeConstraint) != 0}");
Console.WriteLine($"是值类型: {(attrs & GenericParameterAttributes.NotNullableValueTypeConstraint) != 0}");
Console.WriteLine($"有无参构造函数: {(attrs & GenericParameterAttributes.DefaultConstructorConstraint) != 0}");
```

### 检查类型是否满足约束

```csharp
public class TypeChecker
{
    public static bool SatisfiesConstraints(Type typeArg, Type genericParam)
    {
        // 检查引用类型约束
        if ((genericParam.GenericParameterAttributes & GenericParameterAttributes.ReferenceTypeConstraint) != 0)
        {
            if (typeArg.IsValueType)
                return false;
        }

        // 检查值类型约束
        if ((genericParam.GenericParameterAttributes & GenericParameterAttributes.NotNullableValueTypeConstraint) != 0)
        {
            if (!typeArg.IsValueType)
                return false;
        }

        // 检查无参构造函数约束
        if ((genericParam.GenericParameterAttributes & GenericParameterAttributes.DefaultConstructorConstraint) != 0)
        {
            if (typeArg.GetConstructor(Type.EmptyTypes) == null)
                return false;
        }

        // 检查接口约束
        Type[] constraints = genericParam.GetGenericParameterConstraints();
        foreach (var constraint in constraints)
        {
            if (constraint.IsInterface)
            {
                if (!constraint.IsAssignableFrom(typeArg))
                    return false;
            }
            else
            {
                if (!constraint.IsAssignableFrom(typeArg))
                    return false;
            }
        }

        return true;
    }
}

// 使用
Console.WriteLine(TypeChecker.SatisfiesConstraints(typeof(string), typeof(Constrained<>).GetGenericArguments()[0])); // True
Console.WriteLine(TypeChecker.SatisfiesConstraints(typeof(int), typeof(Constrained<>).GetGenericArguments()[0])); // False
```

---

## 5. 实战例子：泛型容器序列化

让我们实现一个通用的序列化器，支持泛型容器：

### 定义序列化接口

```csharp
public interface ISerializer
{
    string Serialize(object obj);
    object Deserialize(string json, Type type);
}

public class SimpleJsonSerializer : ISerializer
{
    public string Serialize(object obj)
    {
        if (obj == null)
            return "null";

        Type type = obj.GetType();

        // 处理基本类型
        if (type.IsPrimitive || type == typeof(string))
        {
            return type == typeof(string) ? $"\"{obj}\"" : obj.ToString();
        }

        // 处理泛型列表
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(List<>))
        {
            return SerializeList(obj);
        }

        // 处理泛型字典
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(Dictionary<,>))
        {
            return SerializeDictionary(obj);
        }

        // 处理普通对象
        return SerializeObject(obj);
    }

    private string SerializeList(object obj)
    {
        Type listType = obj.GetType();
        Type elementType = listType.GetGenericArguments()[0];

        var items = new List<string>();
        foreach (var item in (System.Collections.IEnumerable)obj)
        {
            items.Add(Serialize(item));
        }

        return $"[{string.Join(",", items)}]";
    }

    private string SerializeDictionary(object obj)
    {
        Type dictType = obj.GetType();
        Type[] genericArgs = dictType.GetGenericArguments();
        Type keyType = genericArgs[0];
        Type valueType = genericArgs[1];

        var items = new List<string>();
        var dict = (System.Collections.IDictionary)obj;

        foreach (var key in dict.Keys)
        {
            var value = dict[key];
            items.Add($"\"{key}\":{Serialize(value)}");
        }

        return $"{{{string.Join(",", items)}}}";
    }

    private string SerializeObject(object obj)
    {
        Type type = obj.GetType();
        var items = new List<string>();

        PropertyInfo[] properties = type.GetProperties();
        foreach (var prop in properties)
        {
            object value = prop.GetValue(obj);
            items.Add($"\"{prop.Name}\":{Serialize(value)}");
        }

        return $"{{{string.Join(",", items)}}}";
    }

    public object Deserialize(string json, Type type)
    {
        // 简化实现，仅作示例
        throw new NotImplementedException();
    }
}
```

### 使用序列化器

```csharp
public class Product
{
    public string Name { get; set; }
    public decimal Price { get; set; }
}

var serializer = new SimpleJsonSerializer();

// 序列化列表
var products = new List<Product>
{
    new Product { Name = "Laptop", Price = 999.99m },
    new Product { Name = "Mouse", Price = 29.99m }
};

string json1 = serializer.Serialize(products);
Console.WriteLine(json1);
// 输出: [{"Name":"Laptop","Price":999.99},{"Name":"Mouse","Price":29.99}]

// 序列化字典
var inventory = new Dictionary<string, int>
{
    { "Laptop", 5 },
    { "Mouse", 20 }
};

string json2 = serializer.Serialize(inventory);
Console.WriteLine(json2);
// 输出: {"Laptop":5,"Mouse":20}
```

---

## 6. 实战例子：泛型工厂

```csharp
public class GenericFactory
{
    private static readonly Dictionary<string, Type> _typeRegistry = new();

    public static void Register<T>(string key) where T : class
    {
        _typeRegistry[key] = typeof(T);
    }

    public static T Create<T>(string key) where T : class
    {
        if (!_typeRegistry.ContainsKey(key))
            throw new InvalidOperationException($"类型 {key} 未注册");

        Type type = _typeRegistry[key];

        // 检查类型是否可以转换为 T
        if (!typeof(T).IsAssignableFrom(type))
            throw new InvalidOperationException($"类型 {type.Name} 不能转换为 {typeof(T).Name}");

        return (T)Activator.CreateInstance(type);
    }

    public static object Create(string key)
    {
        if (!_typeRegistry.ContainsKey(key))
            throw new InvalidOperationException($"类型 {key} 未注册");

        Type type = _typeRegistry[key];
        return Activator.CreateInstance(type);
    }
}

// 使用
public interface ILogger
{
    void Log(string message);
}

public class ConsoleLogger : ILogger
{
    public void Log(string message) => Console.WriteLine($"[LOG] {message}");
}

public class FileLogger : ILogger
{
    public void Log(string message) => Console.WriteLine($"[FILE] {message}");
}

// 注册
GenericFactory.Register<ConsoleLogger>("console");
GenericFactory.Register<FileLogger>("file");

// 创建
ILogger logger1 = GenericFactory.Create<ILogger>("console");
logger1.Log("Hello"); // [LOG] Hello

ILogger logger2 = GenericFactory.Create<ILogger>("file");
logger2.Log("World"); // [FILE] World
```

---

## 7. 泛型反射的性能考虑

### 缓存泛型类型

```csharp
public class GenericTypeCache
{
    private static readonly Dictionary<(Type, Type[]), Type> _cache = new();

    public static Type GetGenericType(Type genericDefinition, params Type[] typeArguments)
    {
        var key = (genericDefinition, typeArguments);

        if (!_cache.ContainsKey(key))
        {
            _cache[key] = genericDefinition.MakeGenericType(typeArguments);
        }

        return _cache[key];
    }
}

// 使用
Type listStringType = GenericTypeCache.GetGenericType(typeof(List<>), typeof(string));
Type listIntType = GenericTypeCache.GetGenericType(typeof(List<>), typeof(int));
```

### 避免重复的 MakeGenericType 调用

```csharp
// ❌ 不好：每次都调用 MakeGenericType
for (int i = 0; i < 1000; i++)
{
    Type type = typeof(List<>).MakeGenericType(typeof(string));
    var instance = Activator.CreateInstance(type);
}

// ✅ 好：缓存泛型类型
Type listStringType = typeof(List<>).MakeGenericType(typeof(string));
for (int i = 0; i < 1000; i++)
{
    var instance = Activator.CreateInstance(listStringType);
}
```

---

## 8. 常见泛型反射模式

### 检查是否是特定泛型类型

```csharp
public static bool IsGenericListOf(Type type, Type elementType)
{
    return type.IsGenericType &&
           type.GetGenericTypeDefinition() == typeof(List<>) &&
           type.GetGenericArguments()[0] == elementType;
}

// 使用
Console.WriteLine(IsGenericListOf(typeof(List<string>), typeof(string))); // True
Console.WriteLine(IsGenericListOf(typeof(List<int>), typeof(string))); // False
```

### 获取泛型基类的泛型参数

```csharp
public class Repository<T> { }
public class UserRepository : Repository<User> { }

Type type = typeof(UserRepository);
Type baseType = type.BaseType;

if (baseType.IsGenericType)
{
    Type[] genericArgs = baseType.GetGenericArguments();
    Console.WriteLine($"泛型参数: {genericArgs[0].Name}"); // User
}
```

---

## 总结

- **开放泛型类型** vs **封闭泛型类型**：使用 `IsGenericTypeDefinition` 区分
- **获取泛型参数**：使用 `GetGenericArguments()`
- **创建泛型类型**：使用 `MakeGenericType()`
- **调用泛型方法**：使用 `MakeGenericMethod()`
- **泛型约束**：使用 `GetGenericParameterConstraints()` 和 `GenericParameterAttributes`
- **性能**：缓存泛型类型和方法以避免重复反射

下一篇我们将学习**性能优化**和**表达式树**的使用。
