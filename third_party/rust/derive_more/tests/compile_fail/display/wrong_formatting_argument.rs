#[derive(derive_more::Display)]
#[display("Stuff({:M})", bar)]
pub struct Foo {
    bar: String,
}

fn main() {}
