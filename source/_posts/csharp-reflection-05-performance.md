---
title: C# 反射由浅入深 (5) — 性能优化与表达式树
date: 2026-05-18
tags:
  - C#
  - 反射
  - Reflection
  - 性能优化
  - 表达式树
  - Expression Tree
categories:
  - C# 反射系列
---

## 本篇定位

这是 C# 反射系列的第五篇，我们学习如何通过**表达式树**优化反射性能。读完你会理解：

- 反射的性能瓶颈在哪里
- 什么是表达式树
- 如何使用表达式树替代反射
- 如何缓存编译的委托
- 实战例子：高性能属性访问器

---

## 1. 反射的性能问题

### 性能对比

```csharp
public class Person
{
    public string Name { get; set; }
    public int Age { get; set; }
}

const int iterations = 1_000_000;
var person = new Person { Name = "Alice", Age = 30 };

// 方式 1：直接访问（基准）
var sw = System.Diagnostics.Stopwatch.StartNew();
for (int i = 0; i < iterations; i++)
{
    var name = person.Name;
}
sw.Stop();
Console.WriteLine($"直接访问: {sw.ElapsedMilliseconds}ms");

// 方式 2：反射访问
PropertyInfo prop = typeof(Person).GetProperty("Name");
sw.Restart();
for (int i = 0; i < iterations; i++)
{
    var name = prop.GetValue(person);
}
sw.Stop();
Console.WriteLine($"反射访问: {sw.ElapsedMilliseconds}ms");

// 方式 3：缓存反射
sw.Restart();
for (int i = 0; i < iterations; i++)
{
    var name = prop.GetValue(person);
}
sw.Stop();
Console.WriteLine($"缓存反射: {sw.ElapsedMilliseconds}ms");
```

典型输出：
```
直接访问: 2ms
反射访问: 150ms
缓存反射: 140ms
```

### 性能瓶颈

反射慢的原因：
1. **类型检查**：运行时需要验证类型安全
2. **参数装箱**：值类型需要装箱
3. **异常处理**：反射操作可能抛异常
4. **动态分派**：无法进行编译时优化

---

## 2. 表达式树基础

### 什么是表达式树

表达式树是一种数据结构，用代码表示代码。它可以被编译成可执行的委托。

```csharp
// 普通 Lambda 表达式
Func<int, int, int> add = (a, b) => a + b;
Console.WriteLine(add(2, 3)); // 5

// 表达式树
Expression<Func<int, int, int>> addExpr = (a, b) => a + b;
Console.WriteLine(addExpr); // (a, b) => (a + b)

// 编译表达式树为委托
Func<int, int, int> compiled = addExpr.Compile();
Console.WriteLine(compiled(2, 3)); // 5
```

### 构建表达式树

```csharp
// 方式 1：使用 Lambda 表达式（简单）
Expression<Func<int, int>> square = x => x * x;

// 方式 2：手动构建（复杂）
ParameterExpression x = Expression.Parameter(typeof(int), "x");
BinaryExpression body = Expression.Multiply(x, x);
Expression<Func<int, int>> squareExpr = Expression.Lambda<Func<int, int>>(body, x);

Func<int, int> squareFunc = squareExpr.Compile();
Console.WriteLine(squareFunc(5)); // 25
```

---

## 3. 使用表达式树优化属性访问

### 高性能属性获取器

```csharp
public class PropertyAccessor
{
    private static readonly Dictionary<(Type, string), Delegate> _getterCache = new();
    private static readonly Dictionary<(Type, string), Delegate> _setterCache = new();

    // 创建高性能的属性获取器
    public static Func<object, object> CreateGetter(Type type, string propertyName)
    {
        var key = (type, propertyName);
        if (_getterCache.TryGetValue(key, out var cached))
            return (Func<object, object>)cached;

        PropertyInfo prop = type.GetProperty(propertyName);
        if (prop == null)
            throw new ArgumentException($"属性 {propertyName} 不存在");

        // 构建表达式树
        ParameterExpression instance = Expression.Parameter(typeof(object), "instance");
        
        // 转换为具体类型
        UnaryExpression instanceCast = Expression.Convert(instance, type);
        
        // 访问属性
        MemberExpression propertyAccess = Expression.Property(instanceCast, prop);
        
        // 转换为 object
        UnaryExpression result = Expression.Convert(propertyAccess, typeof(object));
        
        // 编译为委托
        Expression<Func<object, object>> lambda = Expression.Lambda<Func<object, object>>(result, instance);
        Func<object, object> getter = lambda.Compile();

        _getterCache[key] = getter;
        return getter;
    }

    // 创建高性能的属性设置器
    public static Action<object, object> CreateSetter(Type type, string propertyName)
    {
        var key = (type, propertyName);
        if (_setterCache.TryGetValue(key, out var cached))
            return (Action<object, object>)cached;

        PropertyInfo prop = type.GetProperty(propertyName);
        if (prop == null)
            throw new ArgumentException($"属性 {propertyName} 不存在");

        // 构建表达式树
        ParameterExpression instance = Expression.Parameter(typeof(object), "instance");
        ParameterExpression value = Expression.Parameter(typeof(object), "value");
        
        // 转换为具体类型
        UnaryExpression instanceCast = Expression.Convert(instance, type);
        UnaryExpression valueCast = Expression.Convert(value, prop.PropertyType);
        
        // 设置属性
        MethodCallExpression setProperty = Expression.Call(instanceCast, prop.SetMethod, valueCast);
        
        // 编译为委托
        Expression<Action<object, object>> lambda = Expression.Lambda<Action<object, object>>(setProperty, instance, value);
        Action<object, object> setter = lambda.Compile();

        _setterCache[key] = setter;
        return setter;
    }
}

// 使用
var person = new Person { Name = "Alice", Age = 30 };

// 获取属性
var getter = PropertyAccessor.CreateGetter(typeof(Person), "Name");
object name = getter(person);
Console.WriteLine(name); // Alice

// 设置属性
var setter = PropertyAccessor.CreateSetter(typeof(Person), "Name");
setter(person, "Bob");
Console.WriteLine(person.Name); // Bob
```

### 性能对比

```csharp
const int iterations = 1_000_000;
var person = new Person { Name = "Alice", Age = 30 };

// 直接访问
var sw = System.Diagnostics.Stopwatch.StartNew();
for (int i = 0; i < iterations; i++)
{
    var name = person.Name;
}
sw.Stop();
Console.WriteLine($"直接访问: {sw.ElapsedMilliseconds}ms");

// 反射
PropertyInfo prop = typeof(Person).GetProperty("Name");
sw.Restart();
for (int i = 0; i < iterations; i++)
{
    var name = prop.GetValue(person);
}
sw.Stop();
Console.WriteLine($"反射访问: {sw.ElapsedMilliseconds}ms");

// 表达式树
var getter = PropertyAccessor.CreateGetter(typeof(Person), "Name");
sw.Restart();
for (int i = 0; i < iterations; i++)
{
    var name = getter(person);
}
sw.Stop();
Console.WriteLine($"表达式树: {sw.ElapsedMilliseconds}ms");
```

典型输出：
```
直接访问: 2ms
反射访问: 150ms
表达式树: 5ms
```

---

## 4. 使用表达式树优化方法调用

### 高性能方法调用器

```csharp
public class MethodInvoker
{
    private static readonly Dictionary<(Type, string), Delegate> _methodCache = new();

    public static Func<object, object[], object> CreateInvoker(Type type, string methodName)
    {
        var key = (type, methodName);
        if (_methodCache.TryGetValue(key, out var cached))
            return (Func<object, object[], object>)cached;

        MethodInfo method = type.GetMethod(methodName);
        if (method == null)
            throw new ArgumentException($"方法 {methodName} 不存在");

        // 构建表达式树
        ParameterExpression instance = Expression.Parameter(typeof(object), "instance");
        ParameterExpression parameters = Expression.Parameter(typeof(object[]), "parameters");

        // 转换实例
        UnaryExpression instanceCast = Expression.Convert(instance, type);

        // 构建参数表达式
        ParameterInfo[] methodParams = method.GetParameters();
        Expression[] paramExpressions = new Expression[methodParams.Length];

        for (int i = 0; i < methodParams.Length; i++)
        {
            // 获取数组中的参数
            BinaryExpression arrayAccess = Expression.ArrayIndex(parameters, Expression.Constant(i));
            
            // 转换为参数类型
            UnaryExpression paramCast = Expression.Convert(arrayAccess, methodParams[i].ParameterType);
            paramExpressions[i] = paramCast;
        }

        // 调用方法
        MethodCallExpression methodCall = Expression.Call(instanceCast, method, paramExpressions);

        // 转换返回值
        UnaryExpression result = Expression.Convert(methodCall, typeof(object));

        // 编译
        Expression<Func<object, object[], object>> lambda = 
            Expression.Lambda<Func<object, object[], object>>(result, instance, parameters);
        
        Func<object, object[], object> invoker = lambda.Compile();
        _methodCache[key] = invoker;
        return invoker;
    }
}

// 使用
public class Calculator
{
    public int Add(int a, int b) => a + b;
    public string Concat(string a, string b) => a + b;
}

var calc = new Calculator();

// 调用 Add 方法
var addInvoker = MethodInvoker.CreateInvoker(typeof(Calculator), "Add");
object result1 = addInvoker(calc, new object[] { 5, 3 });
Console.WriteLine(result1); // 8

// 调用 Concat 方法
var concatInvoker = MethodInvoker.CreateInvoker(typeof(Calculator), "Concat");
object result2 = concatInvoker(calc, new object[] { "Hello", "World" });
Console.WriteLine(result2); // HelloWorld
```

---

## 5. 实战例子：高性能对象映射

```csharp
public class FastMapper
{
    private static readonly Dictionary<(Type, Type), Delegate> _mapperCache = new();

    public static TTarget Map<TSource, TTarget>(TSource source) 
        where TSource : class 
        where TTarget : class, new()
    {
        var key = (typeof(TSource), typeof(TTarget));
        
        if (!_mapperCache.TryGetValue(key, out var cached))
        {
            cached = CreateMapper<TSource, TTarget>();
            _mapperCache[key] = cached;
        }

        var mapper = (Func<TSource, TTarget>)cached;
        return mapper(source);
    }

    private static Func<TSource, TTarget> CreateMapper<TSource, TTarget>()
        where TSource : class
        where TTarget : class, new()
    {
        ParameterExpression sourceParam = Expression.Parameter(typeof(TSource), "source");
        
        // 创建目标对象
        NewExpression newTarget = Expression.New(typeof(TTarget));
        
        // 收集属性赋值
        List<MemberBinding> bindings = new();
        
        PropertyInfo[] sourceProps = typeof(TSource).GetProperties();
        PropertyInfo[] targetProps = typeof(TTarget).GetProperties();
        
        foreach (var sourceProp in sourceProps)
        {
            PropertyInfo targetProp = targetProps.FirstOrDefault(p => p.Name == sourceProp.Name);
            if (targetProp != null && targetProp.CanWrite && sourceProp.CanRead)
            {
                // 访问源属性
                MemberExpression sourceAccess = Expression.Property(sourceParam, sourceProp);
                
                // 创建绑定
                MemberBinding binding = Expression.Bind(targetProp, sourceAccess);
                bindings.Add(binding);
            }
        }
        
        // 创建初始化表达式
        MemberInitExpression init = Expression.MemberInit(newTarget, bindings);
        
        // 编译
        Expression<Func<TSource, TTarget>> lambda = Expression.Lambda<Func<TSource, TTarget>>(init, sourceParam);
        return lambda.Compile();
    }
}

// 使用
public class UserDto
{
    public string Name { get; set; }
    public int Age { get; set; }
}

public class UserModel
{
    public string Name { get; set; }
    public int Age { get; set; }
}

var userDto = new UserDto { Name = "Alice", Age = 30 };
var userModel = FastMapper.Map<UserDto, UserModel>(userDto);

Console.WriteLine($"{userModel.Name}, {userModel.Age}"); // Alice, 30
```

---

## 6. 实战例子：动态 Where 查询

```csharp
public class DynamicQueryBuilder
{
    // 构建 Where 条件：x => x.Age > 25
    public static Func<T, bool> BuildPredicate<T>(string propertyName, string op, object value)
    {
        ParameterExpression param = Expression.Parameter(typeof(T), "x");
        MemberExpression property = Expression.Property(param, propertyName);
        
        ConstantExpression constant = Expression.Constant(value);
        
        BinaryExpression comparison = op switch
        {
            ">" => Expression.GreaterThan(property, constant),
            "<" => Expression.LessThan(property, constant),
            "==" => Expression.Equal(property, constant),
            "!=" => Expression.NotEqual(property, constant),
            ">=" => Expression.GreaterThanOrEqual(property, constant),
            "<=" => Expression.LessThanOrEqual(property, constant),
            _ => throw new ArgumentException($"不支持的操作符: {op}")
        };
        
        Expression<Func<T, bool>> lambda = Expression.Lambda<Func<T, bool>>(comparison, param);
        return lambda.Compile();
    }
}

// 使用
var people = new List<Person>
{
    new Person { Name = "Alice", Age = 30 },
    new Person { Name = "Bob", Age = 25 },
    new Person { Name = "Charlie", Age = 35 }
};

// 动态构建查询
var predicate = DynamicQueryBuilder.BuildPredicate<Person>("Age", ">", 25);
var result = people.Where(predicate).ToList();

foreach (var person in result)
{
    Console.WriteLine($"{person.Name}, {person.Age}");
}
// 输出:
// Alice, 30
// Charlie, 35
```

---

## 7. 表达式树的限制

### 不能做的事情

```csharp
// ❌ 不能包含循环
Expression<Func<int, int>> loop = x =>
{
    int result = 0;
    for (int i = 0; i < x; i++)
        result += i;
    return result;
};

// ❌ 不能包含 try-catch
Expression<Func<int, int>> tryCatch = x =>
{
    try
    {
        return x / 0;
    }
    catch
    {
        return 0;
    }
};

// ✅ 可以使用条件表达式
Expression<Func<int, int, int>> conditional = (a, b) => a > b ? a : b;
```

---

## 8. 性能优化总结

| 方法 | 相对速度 | 优点 | 缺点 |
|------|--------|------|------|
| 直接访问 | 1x | 最快 | 需要编译时知道类型 |
| 表达式树 | ~2-3x | 接近直接访问 | 编译开销 |
| 缓存反射 | ~50-100x | 简单易用 | 仍然较慢 |
| 反射 | ~50-100x | 最灵活 | 最慢 |

### 优化建议

1. **优先使用直接访问**
2. **如果需要动态性，使用表达式树**
3. **缓存编译的委托**
4. **避免在热路径中进行反射**
5. **考虑使用代码生成替代运行时反射**

---

## 9. 实战例子：通用对象复制器（优化版）

```csharp
public class FastObjectCloner
{
    private static readonly Dictionary<Type, Delegate> _clonerCache = new();

    public static T Clone<T>(T source) where T : class
    {
        if (source == null)
            return null;

        Type type = typeof(T);
        
        if (!_clonerCache.TryGetValue(type, out var cached))
        {
            cached = CreateCloner<T>();
            _clonerCache[type] = cached;
        }

        var cloner = (Func<T, T>)cached;
        return cloner(source);
    }

    private static Func<T, T> CreateCloner<T>() where T : class
    {
        ParameterExpression sourceParam = Expression.Parameter(typeof(T), "source");
        
        // 创建新实例
        NewExpression newInstance = Expression.New(typeof(T));
        
        // 收集属性赋值
        List<MemberBinding> bindings = new();
        
        PropertyInfo[] properties = typeof(T).GetProperties();
        foreach (var prop in properties)
        {
            if (prop.CanRead && prop.CanWrite)
            {
                MemberExpression sourceAccess = Expression.Property(sourceParam, prop);
                MemberBinding binding = Expression.Bind(prop, sourceAccess);
                bindings.Add(binding);
            }
        }
        
        // 创建初始化表达式
        MemberInitExpression init = Expression.MemberInit(newInstance, bindings);
        
        // 编译
        Expression<Func<T, T>> lambda = Expression.Lambda<Func<T, T>>(init, sourceParam);
        return lambda.Compile();
    }
}

// 使用
var original = new Person { Name = "Alice", Age = 30 };
var cloned = FastObjectCloner.Clone(original);

cloned.Name = "Bob";
Console.WriteLine($"原始: {original.Name}"); // Alice
Console.WriteLine($"克隆: {cloned.Name}");   // Bob
```

---

## 总结

- **反射性能慢**：主要原因是类型检查、装箱、异常处理
- **表达式树**：可以编译成高效的委托，性能接近直接访问
- **缓存编译结果**：避免重复编译表达式树
- **应用场景**：ORM、映射、动态查询、序列化等
- **权衡**：灵活性 vs 性能

下一篇我们将学习**实战应用**：如何在真实项目中使用反射。
