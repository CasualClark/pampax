class HelloWorld {
  String name;
  
  HelloWorld(this.name);
  
  void sayHello() {
    print('Hello, $name!');
  }
  
  String get greeting => 'Hello, $name';
  
  void setName(String newName) {
    name = newName;
  }
}

void main() {
  final hello = HelloWorld('World');
  hello.sayHello();
  print(hello.greeting);
}