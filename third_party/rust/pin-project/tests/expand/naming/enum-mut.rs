use pin_project::pin_project;

#[pin_project(project = Proj)]
enum Enum<T, U> {
    Struct {
        #[pin]
        pinned: T,
        unpinned: U,
    },
    Tuple(#[pin] T, U),
    Unit,
}

fn main() {}
